import { useState, useEffect } from 'react';
import { Download, Share } from 'lucide-react';

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showIOSHint, setShowIOSHint] = useState(false);

  useEffect(() => {
    // Check if already installed (standalone mode)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true
      || document.referrer.includes('android-app://');
    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    // Detect iOS for manual instructions
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIOS) {
      setShowIOSHint(true);
      return;
    }

    // Listen for beforeinstallprompt (Chrome, Edge, etc.)
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setDeferredPrompt(null);
  };

  if (isInstalled) return null;

  if (showIOSHint) {
    return (
      <div className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-soft">
        <Share size={18} className="shrink-0 text-accent" />
        <span className="text-left">Tap Share, then &quot;Add to Home Screen&quot;</span>
      </div>
    );
  }

  if (!deferredPrompt) return null;

  return (
    <button
      type="button"
      onClick={handleInstall}
      className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-accent hover:bg-accent/10 border border-accent/20 transition-all w-full min-h-[44px]"
    >
      <Download size={18} />
      Add to Home Screen
    </button>
  );
}
