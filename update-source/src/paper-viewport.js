// Only the paper is transformed. Its SVG keeps the original 900 x 1200 units.
export function clampPaperView(view, size) {
  const scale = Math.max(0.5, Math.min(4, Number(view.scale) || 1));
  const width = size.paperWidth * scale, height = size.paperHeight * scale;
  return {
    scale,
    x: width <= size.width ? (size.width - width) / 2 : Math.max(size.width - width, Math.min(0, view.x)),
    y: height <= size.height ? 0 : Math.max(size.height - height, Math.min(0, view.y)),
  };
}

export function movePaperView(start, from, to, ratio, size) {
  const scale = Math.max(0.5, Math.min(4, start.scale * ratio));
  const factor = scale / start.scale;
  return clampPaperView({scale, x: to.x - (from.x - start.x) * factor, y: to.y - (from.y - start.y) * factor}, size);
}

export function mountPaperViewport({container, paper, onChange = () => {}, beforeChange = () => {}, win = window}) {
  let view = {scale: 1, x: 0, y: 0}, revision = 0;
  const size = () => ({width: container.clientWidth, height: container.clientHeight, paperWidth: paper.offsetWidth, paperHeight: paper.offsetHeight});
  let appliedSize = size(), appliedPosition = container.getBoundingClientRect();
  const local = p => {const r = container.getBoundingClientRect(); return {x: p.x - r.left, y: p.y - r.top};};
  function apply(next) {
    appliedSize = size();
    appliedPosition = container.getBoundingClientRect();
    view = clampPaperView(next, appliedSize);
    paper.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    onChange({...view});
  }
  function reset() {beforeChange(); revision++; apply({scale: 1, x: 0, y: 0});}
  function resize() {
    const nextSize = size(), position = container.getBoundingClientRect();
    // Android may report window resize without a real paper change. Both
    // notification paths use the same guard so one resize settles ink once.
    const sameSize = Object.keys(nextSize).every(key => nextSize[key] === appliedSize[key]);
    const samePosition = ['left', 'top'].every(key => Math.abs(position[key] - appliedPosition[key]) < .75);
    if (sameSize && samePosition) return;
    beforeChange('resize'); revision++; apply(view);
  }
  const observedResize = resize;
  const observer = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(observedResize) : null;
  observer?.observe(container); win.addEventListener('resize', resize);
  apply(view);
  return {
    reset,
    // Crop layout only: caller settles the pointer first; never cancel its draft.
    focusRect(rect, {padding = 28} = {}) {
      if (!rect || !['x', 'y', 'width', 'height'].every(k => Number.isFinite(rect[k])) || rect.width <= 0 || rect.height <= 0) return false;
      const s = size();
      if (![s.width, s.height, s.paperWidth, s.paperHeight].every(n => Number.isFinite(n) && n > 0)) return false;
      const inset = Number.isFinite(padding) ? Math.max(0, padding) : 28;
      const x = rect.x * s.paperWidth / 900, y = rect.y * s.paperHeight / 1200;
      const width = rect.width * s.paperWidth / 900, height = rect.height * s.paperHeight / 1200;
      const scale = Math.max(.5, Math.min(4, Math.max(1, s.width - 2 * inset) / width, Math.max(1, s.height - 2 * inset) / height));
      revision++;
      apply({scale, x: s.width / 2 - (x + width / 2) * scale, y: s.height / 2 - (y + height / 2) * scale});
      return true;
    },
    hasHorizontalOverflow: () => size().paperWidth * view.scale > size().width + 1,
    revision: () => revision,
    snapshot: () => ({...view}),
    begin: center => ({view: {...view}, center: local(center), revision}),
    move(start, center, ratio) {
      if (start.revision !== revision) return false;
      apply(movePaperView(start.view, start.center, local(center), ratio, size())); return true;
    },
    zoomBy(factor) {
      beforeChange(); revision++;
      const s = size(), center = {x: s.width / 2, y: s.height / 2};
      apply(movePaperView(view, center, center, factor, s));
    },
    panBy(dx, dy) {beforeChange(); revision++; apply({...view, x: view.x + dx, y: view.y + dy});},
    dispose() {observer?.disconnect(); win.removeEventListener('resize', resize);},
  };
}

