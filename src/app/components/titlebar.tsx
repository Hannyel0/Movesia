import { useRendererListener } from '@/app/hooks';
import { MenuChannels } from '@/channels/menuChannels';
import type { WindowState } from '@/windowState';

import { useState, useEffect } from 'react';

import Menu from './menu';
import WindowControls from './window-controls';
import { IndexingStatusComponent } from './indexing-status';
import { UnityConnectionStatus } from './unity-connection-status';

const handleDoubleClick = () => {
  electron.ipcRenderer.invoke(MenuChannels.WINDOW_TOGGLE_MAXIMIZE);
};

export default function Titlebar () {
  const [windowState, setWindowState] = useState<WindowState>('normal');
  const [wcw, setWcw] = useState(120); // fallback width for window controls

  useRendererListener('window-state-changed', (_, windowState: WindowState) => setWindowState(windowState));

  // Track window controls width to reserve space for absolutely positioned controls
  useEffect(() => {
    const el = document.getElementById('window-controls');
    const bar = document.querySelector('.window-titlebar') as HTMLElement | null;
    const sync = () => {
      const w = el?.offsetWidth ?? 120;
      setWcw(w);
      bar?.style.setProperty('--wcw', `${w}px`);
    };
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);

  // Hide titlebar in full screen mode on macOS
  if (windowState === 'full-screen' && __DARWIN__) {
    return null;
  }

  return (
    <div onDoubleClick={handleDoubleClick} className='window-titlebar'>
      {__WIN32__ && (
        <>
          <Menu />
          <div className="flex-1" />
          <div
            className="flex items-center gap-2"
            style={{ WebkitAppRegion: 'no-drag', paddingRight: `calc(var(--wcw, ${wcw}px) + 8px)` } as React.CSSProperties}
          >
            <UnityConnectionStatus />
            <IndexingStatusComponent />
          </div>
          <WindowControls id="window-controls" windowState={windowState} />
        </>
      )}
      {__DARWIN__ && (
        <div className="flex-1 flex justify-end items-center pr-4" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <div className="flex items-center gap-2">
            <UnityConnectionStatus />
            <IndexingStatusComponent />
          </div>
        </div>
      )}
    </div>
  );
}
