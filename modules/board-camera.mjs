import { BOARD_BOUNDS } from './board-state.mjs';

export const MIN_BOARD_ZOOM=.02;
export const MAX_BOARD_ZOOM=2.5;

/** Start at the centre with the complete board frame visible. */
export function overviewBoardCamera(viewport){
  return fitBoardCamera([BOARD_BOUNDS],viewport);
}

/** Fit all evidence, reserving room for the toolbar and card tools. */
export function fitBoardCamera(boxes,{width,height}){
  if(!boxes.length)return overviewBoardCamera({width,height});
  const minX=Math.min(...boxes.map(b=>b.left))-75,minY=Math.min(...boxes.map(b=>b.top))-75;
  const maxX=Math.max(...boxes.map(b=>b.right))+75,maxY=Math.max(...boxes.map(b=>b.bottom))+75;
  const usableWidth=Math.max(1,width-40),usableHeight=Math.max(1,height-110);
  const zoom=Math.max(MIN_BOARD_ZOOM,Math.min(1,usableWidth/(maxX-minX),usableHeight/(maxY-minY)));
  return{zoom,pan:{x:(width-(maxX-minX)*zoom)/2-minX*zoom,y:70+(usableHeight-(maxY-minY)*zoom)/2-minY*zoom}};
}
