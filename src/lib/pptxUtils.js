// Helper bersama untuk export PPTX (dipakai Weekly Huddle, Weekly Trend, dan Availability).

/**
 * Daftar path file chart (mis. 'ppt/charts/chart3.xml') milik slide ke-`slideNo` (mulai 1),
 * sesuai urutan addChart di slide tsb. Dibaca dari rels slide supaya benar walau deck punya banyak slide.
 */
export async function getSlideChartPaths(zip, slideNo) {
  const relsFile = zip.file(`ppt/slides/_rels/slide${slideNo}.xml.rels`);
  const relsXml = relsFile ? await relsFile.async('string') : '';
  return [...relsXml.matchAll(/<Relationship\b[^>]*\/>/g)]
    .map(([relationship]) => {
      if (!/\bType="[^"]*\/chart"/.test(relationship)) return null;
      const target = relationship.match(/\bTarget="([^"]+)"/)?.[1];
      if (!target) return null;
      const parts = target.startsWith('/') ? [] : ['ppt', 'slides'];
      for (const part of target.split('/')) {
        if (!part || part === '.') continue;
        if (part === '..') parts.pop();
        else parts.push(part);
      }
      return parts.join('/');
    })
    .filter(Boolean);
}

export async function loadLogoDataUrl() {
  try {
    const { default: url } = await import('../assets/header-logos.png');
    const blob = await (await fetch(url)).blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null; // logo opsional, export tetap jalan tanpa logo
  }
}

export function downloadPptx(buffer, fileName) {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Rapikan XML chart kombinasi (bar + line) buatan pptxgenjs supaya valid untuk PowerPoint:
 *  - barChart hanya boleh punya 2 axId (pptxgenjs menulis 3);
 *  - lineChart ditulis ulang dari tx/cat/val series pertamanya (idx unik, urutan elemen sesuai skema).
 * line: { color, width, marker, markerSize, hidden, dLbls }  (hidden = garis tak terlihat, dipakai utk label total)
 * @returns { xml, barCount, lineIdx }
 */
export function normalizeComboXml(xml, line = {}) {
  xml = xml.replace(
    /(<c:barChart>[\s\S]*?)(<c:axId val="\d+"\/>)(<c:axId val="\d+"\/>)(<c:axId val="\d+"\/>)(<\/c:barChart>)/,
    '$1$2$3$5'
  );
  const barXml = xml.match(/<c:barChart>[\s\S]*?<\/c:barChart>/)?.[0] || '';
  const barSers = barXml.match(/<c:ser>/g) || [];
  const barIdx = [...barXml.matchAll(/<c:ser>\s*<c:idx val="(\d+)"\/>/g)].map((m) => Number(m[1]));
  const lineIdx = barIdx.length ? Math.max(...barIdx) + 1 : barSers.length;
  const { color = '14202B', width = 25400, marker = false, markerSize = 6, hidden = false, dLbls = '' } = line;

  xml = xml.replace(/<c:lineChart>([\s\S]*?)<\/c:lineChart>/, (m, inner) => {
    const ser = inner.match(/<c:ser>([\s\S]*?)<\/c:ser>/)?.[1];
    if (!ser) return m;
    const tx = ser.match(/<c:tx>[\s\S]*?<\/c:tx>/)?.[0] || '';
    const cat = ser.match(/<c:cat>[\s\S]*?<\/c:cat>/)?.[0] || '';
    const val = ser.match(/<c:val>[\s\S]*?<\/c:val>/)?.[0] || '';
    const axIds = (inner.match(/<c:axId val="\d+"\/>/g) || []).slice(0, 2).join('');
    const spPr = hidden
      ? `<c:spPr><a:ln w="${width}"><a:noFill/></a:ln></c:spPr>`
      : `<c:spPr><a:ln w="${width}" cap="rnd"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:round/></a:ln></c:spPr>`;
    const mk = marker
      ? `<c:marker><c:symbol val="circle"/><c:size val="${markerSize}"/><c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:ln></c:spPr></c:marker>`
      : '<c:marker><c:symbol val="none"/></c:marker>';
    return (
      `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>` +
      `<c:ser><c:idx val="${lineIdx}"/><c:order val="${lineIdx}"/>${tx}${spPr}${mk}${dLbls}${cat}${val}<c:smooth val="0"/></c:ser>` +
      `<c:marker val="1"/>${axIds}</c:lineChart>`
    );
  });
  xml = xml.replace('<c:roundedCorners val="1"/>', '<c:roundedCorners val="0"/>');
  return { xml, barCount: barSers.length, lineIdx };
}
