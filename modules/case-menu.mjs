export class CaseMenu extends foundry.applications.ux.ContextMenu {
  constructor(cases) {
    const entry=(label,icon,action,group)=>({label,icon:`fa-solid fa-${icon}`,group,onClick:()=>cases.run(action)});
    super(document.body,'.pms-case-menu-trigger',[
      {label:'Sektor PMS',icon:'fa-solid fa-door-open',group:'Hub',onClick:()=>game.pms.openHub()},
      entry('Příprava pro Vypravěče','list-check','showPreparation','Podklady'),
      entry('Příručka vypravěče','book-open','showGuide','Podklady'),
      entry('Editor případů','feather','showEditor','Podklady'),
      {label:'Rozluštění a energie',icon:'fa-solid fa-square-check',group:'Výprava',onClick:()=>game.pms.openRewards()},
      entry('Skutečný výsledek','book-bookmark','showResult','Výprava'),
      entry('Připravit odjezd v MHD','train-subway','start','Výprava'),
      entry('Importovat případ…','file-import','importDialog','Správa'),
      entry('Obnovit scény a mapy','layer-group','repair','Správa')
    ],{fixed:true,relative:'target',jQuery:false});
  }
  async _onRender(options){await super._onRender(options);this.element.classList.add('pms-case-menu');}
  open(event){return this.render(event.target.closest('[data-tool="caseTools"]')??event.target,{event,animate:false});}
}
