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
