#!/usr/bin/env python3
"""Каждую минуту пишет в /var/log/syn-watch.csv, сколько входящих SYN дошло до сервера
и сколько SYN-ACK ушло (всего и по адресам из /etc/syn-watch.ips). Минуты без пакетов пишутся нулями.

Как читать при сбое связи:
  SYN есть, SYN-ACK нет     -> сервер/файрвол не отвечает;
  SYN и SYN-ACK есть        -> ответ уходит, теряется на обратном пути к клиенту;
  SYN нет, а клиент пытался -> пакеты не доходят до сервера (фильтр/потери до VPS).
Запускается как systemd-сервис syn-watch.service (см. infra/install-syn-watch.sh)."""
import subprocess, sys, time, re

IPS_FILE = "/etc/syn-watch.ips"
OUT = "/var/log/syn-watch.csv"
FILTER = ("tcp and (port 22 or port 80 or port 443 or port 2222) "
          "and tcp[tcpflags] & tcp-syn != 0 and tcp[tcpflags] & tcp-rst == 0")
LINE = re.compile(r"^(\d+)\.\d+ (\S+)\s+(In|Out)\s+IP ([\d.]+)\.\d+ > ([\d.]+)\.\d+: Flags \[(S\.?)\]")
SKIP_IF = ("lo", "docker", "br-", "veth")

def load_ips():
    try:
        return [l.strip() for l in open(IPS_FILE) if re.fullmatch(r"[\d.]+", l.strip())]
    except OSError:
        return []

ips = load_ips()
def header():
    return "minute_utc,syn_total,synack_total" + "".join(f",{ip}_syn,{ip}_synack" for ip in ips)
def fmt(m, tot_s, tot_a, ws, wa):
    t = time.strftime("%Y-%m-%dT%H:%MZ", time.gmtime(m * 60))
    return f"{t},{tot_s},{tot_a}" + "".join(f",{ws.get(ip,0)},{wa.get(ip,0)}" for ip in ips)

with open(OUT, "a") as f:
    if f.tell() == 0:
        f.write(header() + "\n")

p = subprocess.Popen(["tcpdump", "-l", "-nn", "-tt", "-i", "any", FILTER],
                     stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, bufsize=1)
cur = int(time.time() // 60)
tot_s = tot_a = 0; ws = {}; wa = {}

def emit_until(target):
    global cur, tot_s, tot_a, ws, wa
    with open(OUT, "a") as f:
        while cur < target:
            f.write(fmt(cur, tot_s, tot_a, ws, wa) + "\n")
            cur += 1; tot_s = tot_a = 0; ws = {}; wa = {}

for line in p.stdout:
    m = LINE.match(line)
    if not m:
        continue
    minute = int(m.group(1)) // 60
    if minute > cur:
        emit_until(minute)
    iface, kind, src, dst, fl = m.group(2), m.group(3), m.group(4), m.group(5), m.group(6)
    if iface == "lo" or iface.startswith(SKIP_IF):
        continue
    if fl == "S" and kind == "In":
        tot_s += 1; ws[src] = ws.get(src, 0) + 1
    elif fl == "S." and kind == "Out":
        tot_a += 1; wa[dst] = wa.get(dst, 0) + 1
sys.exit(p.wait())
