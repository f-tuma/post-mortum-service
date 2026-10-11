/** Foundry14 clamps derived Tile coordinates to the Scene even when source X/Y are signed.
 * Vista layers intentionally extend beyond the frame, so their native shape must use
 * the persisted coordinates too. Other Scenes retain Foundry's normal behavior.
 */
export function createVistaTileDocument(BaseTileDocument){
 return class PMSVistaTileDocument extends BaseTileDocument {
  prepareDerivedData(){
   super.prepareDerivedData();
   if(!this.parent?.getFlag('pms','hubVista'))return;
   this.x=this._source.x;
   this.y=this._source.y;
   this.shape.updateSource({x:this.x,y:this.y});
  }
 };
}
