/** Resolve private preparation locally. Never copy GM text into Actor documents. */
export function npcPreparation(actor, caseData, isGM) {
  if (!isGM || actor?.type !== 'npc' || !caseData) return null;
  const reference = actor.flags?.pms;
  if (reference?.caseBundle !== caseData.id || !reference.caseNpc) return null;
  const page = caseData.guidePages?.find(page => page.flags?.pms?.npcId === reference.caseNpc);
  if (!page) return null;
  return { pageId: page._id, content: page.text.content };
}

/** Compiled guide labels become sections; all detail survives in the sheet. */
export function npcSections(content) {
  content=String(content).trim();
  if (/^<div\b[^>]*class="pms-case-guide-content"/.test(content))
    content=content.replace(/^<div\b[^>]*>/,'').replace(/<\/div>\s*$/,'');
  const headings = [...String(content).matchAll(/<h([23])\b[^>]*>([\s\S]*?)<\/h\1>/g)];
  const linked = html => html.replaceAll('data-action="goToHeading"', 'data-npc-guide');
  if(!headings.length)return content?[{title:'Příprava',html:linked(content)}]:[];
  const prelude=content.slice(0,headings[0].index).trim();
  return [...(prelude?[{title:'Úvod přípravy',html:linked(prelude)}]:[]),...headings.map((heading, index) => ({
    title: heading[2].replace(/<[^>]*>/g, '').trim(),
    html: linked(content.slice(heading.index + heading[0].length, headings[index + 1]?.index ?? content.length))
  }))];
}

export function isPrimaryNPCSection(title) {
  return ['Příprava', 'Úvod přípravy', 'Cíl', 'Slabost', 'Co ví', 'Co neví', 'Co skrývá', 'Hlas'].includes(title)
    || title.startsWith('Reakce na důkazy');
}

const sectionPresentation = {
  'Cíl': {group:'personality',icon:'bullseye',tone:'goal'},
  'Slabost': {group:'personality',icon:'heart-crack',tone:'weakness'},
  'Hlas': {group:'personality',icon:'quote-left',tone:'voice',wide:true},
  'Co ví': {group:'information',icon:'book-open',tone:'knowledge',wide:true},
  'Co neví': {group:'information',icon:'circle-question',tone:'unknown'},
  'Co skrývá': {group:'information',icon:'eye-slash',tone:'secret'},
  'Výchozí den': {group:'routine',icon:'clock',tone:'routine',wide:true},
  'Vedení postavy': {group:'personality',icon:'masks-theater',detail:true},
  'První dojem': {group:'personality',icon:'eye',detail:true},
  'Lži a ověření': {group:'information',icon:'masks-theater',tone:'secret',detail:true},
  'Výpověď a ověření': {group:'information',icon:'comments',tone:'knowledge',detail:true}
};

/** Keep every author-written section exactly once, including unfamiliar headings. */
export function npcSectionGroups(sections) {
  const groups = [
    {key:'personality',label:'Osobnost',icon:'masks-theater',sections:[]},
    {key:'information',label:'Informace',icon:'book-open',sections:[]},
    {key:'interaction',label:'Jednání',icon:'comments',sections:[]},
    {key:'routine',label:'Průběh dne',icon:'clock',sections:[]}
  ];
  sections.forEach((section,index) => {
    let presentation = sectionPresentation[section.title];
    if (!presentation && section.title.startsWith('Reakce na důkazy'))
      presentation = {group:'interaction',icon:'comments',tone:'reaction',wide:true};
    if (!presentation && /^(Předání dokladu|Přezkum a příloha)/.test(section.title))
      presentation = {group:'routine',icon:'calendar-check',tone:'routine',detail:true};
    if (!presentation && /^(Kdy nabídne|Vyjednávání|Hody při|.*[Pp]růběh rozhovoru|Priorita při|Co tato priorita|Odsouhlasený ústup|Co znamená vzdání)/.test(section.title))
      presentation = {group:'interaction',icon:section.title.startsWith('Hody')?'dice-d6':'handshake',tone:'reaction',detail:true};
    presentation ??= {group:'personality',icon:'file-lines',wide:true,detail:!['Příprava','Úvod přípravy'].includes(section.title)};
    groups.find(group => group.key === presentation.group).sections.push({
      ...section,...presentation,key:`${index}:${section.title}`
    });
  });
  return groups.filter(group => group.sections.length);
}
