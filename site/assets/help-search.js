(function () {
  var input = document.getElementById('hlp-search-input');
  var countEl = document.getElementById('hlp-search-count');
  if (!input || !countEl) return;

  var sections = Array.prototype.slice.call(document.querySelectorAll('.hlp-sec'));
  var tocItems = Array.prototype.slice.call(document.querySelectorAll('.hlp-toc li'));
  var originals = sections.map(function (s) { return s.innerHTML; });

  function normalize(s) {
    return s.toLowerCase().replace(/ё/g, 'е');
  }

  function highlightTextNode(node, query) {
    var text = node.nodeValue;
    var norm = normalize(text);
    var idx = norm.indexOf(query);
    if (idx === -1) return 0;
    var frag = document.createDocumentFragment();
    var pos = 0;
    var count = 0;
    while (idx !== -1) {
      frag.appendChild(document.createTextNode(text.slice(pos, idx)));
      var mark = document.createElement('mark');
      mark.textContent = text.slice(idx, idx + query.length);
      frag.appendChild(mark);
      count++;
      pos = idx + query.length;
      idx = norm.indexOf(query, pos);
    }
    frag.appendChild(document.createTextNode(text.slice(pos)));
    node.parentNode.replaceChild(frag, node);
    return count;
  }

  function highlightIn(el, query) {
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    var nodes = [];
    var n;
    while ((n = walker.nextNode())) nodes.push(n);
    var total = 0;
    nodes.forEach(function (node) { total += highlightTextNode(node, query); });
    return total;
  }

  function runSearch() {
    var raw = input.value.trim();
    var query = normalize(raw);
    var totalMatches = 0;

    sections.forEach(function (sec, i) {
      sec.innerHTML = originals[i];
      if (!query) {
        sec.hidden = false;
        return;
      }
      var matchesHere = normalize(sec.textContent).indexOf(query) !== -1;
      sec.hidden = !matchesHere;
      if (matchesHere) totalMatches += highlightIn(sec, query);
    });

    tocItems.forEach(function (li) {
      if (!query) {
        li.hidden = false;
        return;
      }
      var link = li.querySelector('a');
      var target = link && document.getElementById(link.getAttribute('href').slice(1));
      li.hidden = !target || target.hidden;
    });

    if (!raw) {
      countEl.hidden = true;
      countEl.textContent = '';
    } else {
      countEl.hidden = false;
      countEl.textContent = totalMatches ? ('Найдено: ' + totalMatches) : 'Ничего не найдено';
    }
  }

  input.addEventListener('input', runSearch);
})();
