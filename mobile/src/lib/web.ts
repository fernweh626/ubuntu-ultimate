import { Alert, Platform } from 'react-native';

/*
 * Web stand-ins for things React Native only does on phones: alerts, sharing a file, printing a PDF.
 * On web, Alert.alert does nothing at all, so errors and confirmations silently vanished.
 */

export const IS_WEB = Platform.OS === 'web';

/** Make Alert.alert work in the browser: a message, an OK/Cancel confirm, or a numbered choice. */
export function installWebAlert() {
  if (!IS_WEB || typeof window === 'undefined') return;
  Alert.alert = (title, message, buttons) => {
    const text = [title, message].filter(Boolean).join('\n\n');
    if (!buttons || buttons.length <= 1) {
      window.alert(text);
      buttons?.[0]?.onPress?.();
      return;
    }
    const cancel = buttons.find((b) => b.style === 'cancel');
    const choices = buttons.filter((b) => b !== cancel);
    if (choices.length === 1) {
      if (window.confirm(`${text}\n\nOK = ${choices[0].text}`)) choices[0].onPress?.();
      else cancel?.onPress?.();
      return;
    }
    const answer = window.prompt(`${text}\n\n${choices.map((b, i) => `${i + 1}. ${b.text}`).join('\n')}\n\nType a number:`, '1');
    const picked = choices[Number(answer) - 1];
    if (picked) picked.onPress?.();
    else cancel?.onPress?.();
  };
}

async function toBlob(src: string, mime: string) {
  if (src.startsWith('data:') || src.startsWith('blob:') || src.startsWith('http')) return (await fetch(src)).blob();
  // Raw base64 (what view-shot returns for result: 'base64').
  const bytes = Uint8Array.from(atob(src), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}

/** Share files in the browser (phone browsers open the share sheet), or download them. */
export async function webShareFiles(files: { src: string; name: string; mime: string }[], title: string) {
  const ready = await Promise.all(files.map(async (f) => new File([await toBlob(f.src, f.mime)], f.name, { type: f.mime })));
  if (navigator.canShare?.({ files: ready })) {
    try {
      await navigator.share({ files: ready, title });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return; // they closed the share sheet
    }
  }
  for (const f of ready) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(f);
    a.download = f.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  }
}

/** Print HTML in the browser; "Save as PDF" is in the print dialog. */
export function webPrint(html: string) {
  const w = window.open('', '_blank');
  if (!w) return Alert.alert('Allow pop-ups', 'Your browser blocked the print window. Allow pop-ups for this site and try again.');
  w.document.write(html);
  w.document.close();
  w.onload = () => w.print();
  setTimeout(() => w.print(), 800);
}

/** Read a picked file (blob: or data: URL on web) into a data URL we can keep in the database. */
export async function webDataUrl(uri: string) {
  const blob = await (await fetch(uri)).blob();
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
