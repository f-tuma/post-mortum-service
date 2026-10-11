/** Replace only the previous stock first impressions; GM explanations remain below them. */
const REPLACEMENTS=[
 ['Rodinná kaple je klidná, bez skutečné útočné kletby.','V rodinné kapli je klid.'],
 [' Běla je vytvořila v noci po Viktorově smrti a dokončovala v 5:30; Havel to viděl a zaznamenal do knihy stráže.',''],
 ['zbytky zásahu hluku za balvanem','šňůra a kovová destička za balvanem'],
 ['Ani největší skrytá místnost nevypadá jako tajný chrám zkázy.','Ve světle lamp se střídají svazky knih a úhledné stohy listin.'],
 ['portrétní miniatura mladé Adély, kterou ona nikdy neposkytla jako slib','portrétní miniatura mladé Adély'],
 ['Zavřená, ale nezamčená dřevěná skříňka s černým lesklým krystalem; zvenčí obyčejná sbírka osobních předmětů.','Na stole stojí zavřená dřevěná skříňka; kolem ní několik drobných osobních předmětů.']
];
export function correctTetoveReadAloud(text){
 return text.replace(/(?:\*\*První dojem:\*\*|<strong>První dojem:<\/strong>|<h[23]\b[^>]*>První dojem<\/h[23]>\s*<p>)[^]*?(?=\n\n|<\/p>|$)/g,paragraph=>{
  for(const [from,to] of REPLACEMENTS)paragraph=paragraph.replace(from,to);
  return paragraph;
 });
}
