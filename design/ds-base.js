(() => {
  const base = '../..';
  for (const p of ['styles.css']) { // ten-gui global stylesheet (fonts + tokens + utilities)
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = base + '/' + p;
    document.head.appendChild(l);
  }
})();
