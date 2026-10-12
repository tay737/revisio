'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useReviewSession } from '@/components/ReviewSessionContext';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export default function PwaRegister() {
  const pathname = usePathname();
  const { active: reviewActive } = useReviewSession();
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [iosInstructions, setIosInstructions] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [updateHidden, setUpdateHidden] = useState(false);
  const [activating, setActivating] = useState(false);
  const [installed, setInstalled] = useState(false);
  const reloadAfterActivation = useRef(false);
  const isReview = (pathname === '/review' || pathname.startsWith('/review/')) && reviewActive;

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    const ua = navigator.userAgent;
    const isIosSafari = /iphone|ipad|ipod/i.test(ua) && /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);
    if (isIosSafari && !standalone) setIosInstructions(true);

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setIosInstructions(false);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    if ('serviceWorker' in navigator) {
      let registration: ServiceWorkerRegistration | undefined;
      const detectWaiting = () => {
        if (registration?.waiting) setWaitingWorker(registration.waiting);
      };
      const onControllerChange = () => {
        if (reloadAfterActivation.current) {
          reloadAfterActivation.current = false;
          window.location.reload();
        }
      };
      void navigator.serviceWorker.register('/sw.js').then((nextRegistration) => {
        registration = nextRegistration;
        detectWaiting();
        nextRegistration.addEventListener('updatefound', () => {
          const installing = nextRegistration.installing;
          installing?.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) detectWaiting();
          });
        });
        void nextRegistration.update().catch(() => undefined);
      }).catch(() => undefined);
      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
      return () => {
        window.removeEventListener('beforeinstallprompt', onBeforeInstall);
        window.removeEventListener('appinstalled', onInstalled);
        navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      };
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  useEffect(() => {
    setUpdateHidden(false);
  }, [pathname]);

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  const update = () => {
    if (!waitingWorker || isReview) return;
    reloadAfterActivation.current = true;
    setActivating(true);
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  };

  const showUpdate = !!waitingWorker && !updateHidden;
  const showInstall = !installed && (!!installPrompt || iosInstructions);
  if (!showUpdate && !showInstall) return null;

  return (
    <aside className="fixed inset-x-0 bottom-3 z-[70] px-3 pb-safe sm:bottom-5" aria-label="App installation and updates">
      <div className="mx-auto flex max-w-xl flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 shadow-[var(--shadow-float)]">
        <div className="min-w-0 flex-1">
          {showUpdate ? (
            <p className="t-caption" role="status">
              {isReview ? 'An update is ready. Finish this review before updating.' : 'A Revisio update is ready to install.'}
            </p>
          ) : iosInstructions ? (
            <p className="t-caption">In Safari, tap Share, then “Add to Home Screen”.</p>
          ) : (
            <p className="t-caption">Keep Revisio close at hand by adding it to your home screen.</p>
          )}
        </div>
        {showUpdate ? (
          <>
            <button type="button" className="btn btn-primary btn-sm" onClick={update} disabled={isReview || activating}>
              {activating ? 'Updating…' : 'Update now'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setUpdateHidden(true)}>Later</button>
          </>
        ) : installPrompt ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void install()}>Install app</button>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIosInstructions(false)}>Close</button>
        )}
      </div>
    </aside>
  );
}
