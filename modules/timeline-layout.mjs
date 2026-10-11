// The stage is a sticky row-label column followed by the time canvas.
export const LABEL_WIDTH = 168;
export const CANVAS_PAD = 18;
export const TIME_GUTTER = LABEL_WIDTH + CANVAS_PAD;
export const CARD_WIDTH = 176;
export const CARD_HEIGHT = 48;
export const LANE_HEIGHT = 56;
// Zoomed out, cards collapse to one line so the whole case fits on screen.
export const CARD_METRICS = { full: { width: CARD_WIDTH, height: CARD_HEIGHT, lane: LANE_HEIGHT }, compact: { width: 136, height: 28, lane: 32 } };
export const isCompactScale = scale => scale * 60 < 150;
export const ROW_PAD = 8;
export const TRACK_HEIGHT = 46;
export const RULER_HEIGHT = 44;
const END_GUTTER = CARD_WIDTH + 24;

export function fitTimelineScale(viewportWidth, duration) {
  if (!(viewportWidth > 0) || !(duration > 0)) return 1;
  return Math.max(1, viewportWidth - TIME_GUTTER - END_GUTTER) / duration;
}

export const timelineWidth = (duration, scale) => TIME_GUTTER + duration * scale + END_GUTTER;

// Keep the same moment under the pointer (or viewport centre) while zooming. Zooming out
// stops at the complete case, including cases lasting more than one day.
export function zoomTimeline({scale, scroll, viewportWidth, duration, factor, anchor = viewportWidth / 2}) {
  const fit = fitTimelineScale(viewportWidth, duration);
  const nextScale = Math.min(Math.max(18, fit), Math.max(fit, scale * factor));
  const offset = Math.max(0, Math.min(viewportWidth, anchor));
  const moment = (scroll + offset - TIME_GUTTER) / scale;
  const nextScroll = Math.max(0, Math.min(timelineWidth(duration, nextScale) - viewportWidth,
    TIME_GUTTER + moment * nextScale - offset));
  return {scale:nextScale, scroll:nextScroll, overview:nextScale <= fit + 1e-9};
}

export function timelineTickStep(scale) {
  return [15,30,60,120,180,360,720,1440].find(step => step * scale >= 56)
    ?? Math.ceil(56 / scale / 1440) * 1440;
}

/** Scroll offset that shows a moment with a little context on its left. */
export const scrollToMoment = (at, start, scale) => Math.max(0, (at - start) * scale - 120);

/**
 * Places event cards inside their thread rows. Cards that would overlap in time drop into
 * another lane of the same row, so every title stays readable at every zoom level.
 * Coordinates are relative to the time canvas (right of the label column).
 */
export function layoutThreads(threads, start, scale, metrics = CARD_METRICS.full) {
  const positions = new Map(), rows = [];
  let top = 0;
  for (const thread of threads) {
    const lanes = [];
    for (const event of thread.events.slice().sort((a, b) => a.at - b.at)) {
      const x = CANVAS_PAD + (event.at - start) * scale;
      let lane = lanes.findIndex(end => x >= end + 8);
      if (lane < 0) lane = lanes.length;
      lanes[lane] = x + metrics.width;
      positions.set(event.id, { x, y: top + ROW_PAD + lane * metrics.lane, row: thread.id, lane });
    }
    const height = Math.max(lanes.length * metrics.lane - (metrics.lane - metrics.height) + ROW_PAD * 2, 52);
    rows.push({ id: thread.id, label: thread.label, top, height, count: thread.events.length });
    top += height;
  }
  return { positions, rows, height: top };
}
