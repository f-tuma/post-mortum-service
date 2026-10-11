/** Read only the imported guide. Authored GM material is compiled offline and sealed. */
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);

export function buildCaseGuide(data, markdownToHTML = value => `<p>${escape(value)}</p>`) {
  if (data.guidePages !== undefined) {
    if (!Array.isArray(data.guidePages) || (!data.guidePages.length && data.guide?.length) || data.guidePages.length > 180)
      throw new Error('Neplatný rozsah stránek příručky.');
    const seen = new Set();
    return data.guidePages.map(page => {
      const flags = page?.flags?.pms;
      if (!/^[a-zA-Z0-9]{16}$/.test(page?._id) || seen.has(page._id)
        || typeof page.name !== 'string' || page.name.length > 180
        || typeof page.text?.content !== 'string' || page.text.content.length > 200000
        || !/^[a-zA-Z0-9]{16}$/.test(flags?.guideCategoryId)
        || flags.guideCategoryId !== page.category
        || typeof flags.guideGroupName !== 'string' || flags.guideGroupName.length > 100
        || !Number.isInteger(flags.guideGroupOrder) || flags.guideGroupOrder < 0 || flags.guideGroupOrder > 30)
        throw new Error('Neplatná stránka příručky.');
      seen.add(page._id);
      return { ...structuredClone(page), ownership: { default: 0 }, type: 'text',
        text: { format: 1, content: page.text.content } };
    });
  }
  // Older encrypted imports remain readable until the GM updates the guide.
  return (data.guide ?? []).map((page, index) => ({
    _id: `pmsGuide${String(index).padStart(8, '0')}`, name: page.name,
    type: 'text', sort: index * 1000, category: 'pmsGuideGroup001', ownership: { default: 0 },
    text: { format: 1, content: markdownToHTML(String(page.markdown ?? '').replaceAll('<', '&lt;')) },
    flags: { pms: { guideKey: `legacy-${index}`, guideGroup: 'legacy',
      guideGroupName: 'Příprava případu', guideGroupOrder: 0, guideCategoryId: 'pmsGuideGroup001' } }
  }));
}
