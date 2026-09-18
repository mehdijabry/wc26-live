import { useEffect, useState } from 'react'

/**
 * /install-debug — surface every signal the install-button logic relies on.
 *
 * Lets us diagnose "PWA install isn't working" reports without guessing.
 * The user just visits the URL on their device and shares a screenshot;
 * the page shows User-Agent, platform detection, SW state, install
 * eligibility flags, etc.
 */

interface RelatedApp { id?: string; platform: string; url?: string }
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export function InstallDebugPage() {
  const [ua, setUa] = useState('')
  const [touchPoints, setTouchPoints] = useState(0)
  const [androidDetected, setAndroidDetected] = useState(false)
  const [iosDetected, setIosDetected] = useState(false)
  const [chromiumDetected, setChromiumDetected] = useState(false)
  const [matchStandalone, setMatchStandalone] = useState(false)
  const [matchFullscreen, setMatchFullscreen] = useState(false)
  const [matchMinimalUi, setMatchMinimalUi] = useState(false)
  const [iosStandalone, setIosStandalone] = useState<string>('n/a')
  const [swState, setSwState] = useState<string>('checking…')
  const [manifestState, setManifestState] = useState<string>('checking…')
  const [installedApps, setInstalledApps] = useState<string>('checking…')
  const [promptFired, setPromptFired] = useState(false)
  const [appInstalledFired, setAppInstalledFired] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installResult, setInstallResult] = useState<string>('')

  useEffect(() => {
    const u = navigator.userAgent
    setUa(u)
    setTouchPoints((navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints ?? 0)
    setAndroidDetected(/Android/i.test(u))
    setIosDetected(/iPhone|iPad|iPod/.test(u) || (u.includes('Mac') && ((navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints ?? 0) > 1))
    setChromiumDetected(!/Firefox|Focus|FxiOS|Opera Mini|DuckDuckGo|FBAN|FBAV|Instagram|Line|TikTok/.test(u))
    setMatchStandalone(window.matchMedia?.('(display-mode: standalone)').matches === true)
    setMatchFullscreen(window.matchMedia?.('(display-mode: fullscreen)').matches === true)
    setMatchMinimalUi(window.matchMedia?.('(display-mode: minimal-ui)').matches === true)
    const navStd = (navigator as Navigator & { standalone?: boolean }).standalone
    setIosStandalone(typeof navStd === 'boolean' ? String(navStd) : 'undefined (not iOS Safari)')

    // Service Worker state
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (!reg) { setSwState('NOT REGISTERED'); return }
        const active = reg.active?.state ?? 'no active worker'
        setSwState(`registered (active: ${active}, scope: ${reg.scope})`)
      }).catch((e) => setSwState('error: ' + String(e)))
    } else {
      setSwState('serviceWorker API unavailable')
    }

    // Manifest accessibility
    fetch('/manifest.json')
      .then((r) => r.json())
      .then((m: { name?: string; icons?: unknown[] }) => setManifestState(`OK — ${m.name}, ${(m.icons ?? []).length} icons`))
      .catch((e) => setManifestState('FAIL: ' + String(e)))

    // Already installed?
    const navAny = navigator as Navigator & { getInstalledRelatedApps?: () => Promise<RelatedApp[]> }
    if (typeof navAny.getInstalledRelatedApps === 'function') {
      navAny.getInstalledRelatedApps()
        .then((apps) => setInstalledApps(apps.length === 0 ? 'NONE (not installed)' : JSON.stringify(apps)))
        .catch((e) => setInstalledApps('error: ' + String(e)))
    } else {
      setInstalledApps('getInstalledRelatedApps unavailable')
    }

    function onBip(e: Event) {
      e.preventDefault()
      setPromptFired(true)
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    function onAppInstalled() { setAppInstalledFired(true) }
    window.addEventListener('beforeinstallprompt', onBip)
    window.addEventListener('appinstalled', onAppInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBip)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  async function tryInstall() {
    if (!deferredPrompt) { setInstallResult('no deferredPrompt — event never fired'); return }
    try {
      await deferredPrompt.prompt()
      const choice = await deferredPrompt.userChoice
      setInstallResult(`outcome: ${choice.outcome} on ${choice.platform}`)
    } catch (e) {
      setInstallResult('error: ' + String(e))
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 font-mono text-xs">
      <h1 className="text-base font-bold mb-3">Install Debug — /install-debug</h1>
      <div className="space-y-1.5 bg-white p-3 rounded-lg border border-slate-200">
        <Row k="User-Agent" v={ua} />
        <Row k="maxTouchPoints" v={String(touchPoints)} />
        <Row k="isAndroid" v={String(androidDetected)} good={androidDetected} />
        <Row k="isIos" v={String(iosDetected)} good={!iosDetected || !androidDetected} />
        <Row k="isChromium-derived" v={String(chromiumDetected)} good={chromiumDetected} />
        <Row k="matchMedia standalone" v={String(matchStandalone)} />
        <Row k="matchMedia fullscreen" v={String(matchFullscreen)} />
        <Row k="matchMedia minimal-ui" v={String(matchMinimalUi)} />
        <Row k="navigator.standalone" v={iosStandalone} />
        <Row k="Service Worker" v={swState} good={swState.startsWith('registered')} />
        <Row k="Manifest" v={manifestState} good={manifestState.startsWith('OK')} />
        <Row k="getInstalledRelatedApps" v={installedApps} />
        <Row k="beforeinstallprompt fired" v={String(promptFired)} good={promptFired} />
        <Row k="appinstalled fired" v={String(appInstalledFired)} />
      </div>

      <div className="mt-4 space-y-2">
        <button
          onClick={tryInstall}
          disabled={!deferredPrompt}
          className="w-full px-4 py-3 rounded-full bg-blue-600 text-white font-semibold disabled:opacity-40"
        >
          Try native install ({deferredPrompt ? 'READY' : 'event not fired'})
        </button>
        {installResult && <div className="bg-amber-50 p-2 rounded text-xs">{installResult}</div>}
      </div>

      <div className="mt-6 p-3 bg-amber-50 border border-amber-200 rounded text-[11px] leading-relaxed">
        <strong>If "beforeinstallprompt fired" stays false:</strong>
        <ul className="list-disc ml-4 mt-1 space-y-1">
          <li>Scroll around / wait — Chrome needs an engagement signal.</li>
          <li>Open Chrome menu (⋮) and check if <strong>"Install app"</strong> is listed. If yes, the manifest is OK and you can install from there.</li>
          <li>If you dismissed an earlier install prompt, Chrome blocklists the site for ~3 months. Reset: Chrome ⋮ → Settings → Site settings → pressing90.live → <strong>Clear &amp; reset</strong>.</li>
          <li>If app was already installed, Chrome never re-fires the event — you'd see it in getInstalledRelatedApps above.</li>
        </ul>
      </div>
    </div>
  )
}

function Row({ k, v, good }: { k: string; v: string; good?: boolean }) {
  const color = good === true ? 'text-emerald-700' : good === false ? 'text-rose-700' : 'text-slate-700'
  return (
    <div className="border-b border-slate-100 pb-1.5">
      <div className="font-bold text-slate-900">{k}</div>
      <div className={'break-all pl-2 ' + color}>→ {v}</div>
    </div>
  )
}
