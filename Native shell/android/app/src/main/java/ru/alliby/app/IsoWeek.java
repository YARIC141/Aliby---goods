package ru.alliby.app;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;

/** ISO-8601 неделя/день недели для виджета "Расписание занятий". */
class IsoWeek {

    private static Calendar calendarFor(String dateStr) {
        Calendar cal = Calendar.getInstance();
        cal.setFirstDayOfWeek(Calendar.MONDAY);
        cal.setMinimalDaysInFirstWeek(4);
        String[] p = dateStr.split("-");
        cal.set(Integer.parseInt(p[0]), Integer.parseInt(p[1]) - 1, Integer.parseInt(p[2]), 0, 0, 0);
        cal.set(Calendar.MILLISECOND, 0);
        return cal;
    }

    /** 1 = Понедельник ... 7 = Воскресенье. */
    static int weekday(String dateStr) {
        Calendar cal = calendarFor(dateStr);
        return (cal.get(Calendar.DAY_OF_WEEK) + 5) % 7 + 1;
    }

    /** 1 или 2 — чётность номера ISO-недели года. */
    static int weekParity(String dateStr) {
        Calendar cal = calendarFor(dateStr);
        int week = cal.get(Calendar.WEEK_OF_YEAR);
        return week % 2 == 0 ? 2 : 1;
    }

    static String addDays(String dateStr, int days) {
        Calendar cal = calendarFor(dateStr);
        cal.add(Calendar.DAY_OF_YEAR, days);
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(cal.getTime());
    }

    static String addMinutesToTime(String hhmm, int minutes) {
        try {
            String[] p = hhmm.split(":");
            int total = Integer.parseInt(p[0]) * 60 + Integer.parseInt(p[1]) + minutes;
            total = ((total % 1440) + 1440) % 1440;
            return String.format(Locale.US, "%02d:%02d", total / 60, total % 60);
        } catch (Exception e) {
            return hhmm;
        }
    }
}
