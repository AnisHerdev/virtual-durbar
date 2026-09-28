import { useEffect, useState } from 'react';
import { ContentContext, loadContent } from './content/loadContent';
import type { Content } from './content/types';
import { useRoute } from './lib/session';
import { Landing } from './components/Landing';
import { RoomApp } from './components/RoomApp';

export function App() {
  const [content, setContent] = useState<Content | null>(null);
  const [error, setError] = useState<string | null>(null);
  const route = useRoute();

  useEffect(() => {
    loadContent().then(setContent, (e: Error) => setError(e.message));
  }, []);

  if (error) {
    return (
      <main className="grid min-h-full place-items-center p-6">
        <div className="folio max-w-lg p-6">
          <h1 className="text-2xl text-sindoor">The scrolls could not be read</h1>
          <pre className="mt-3 whitespace-pre-wrap text-sm">{error}</pre>
        </div>
      </main>
    );
  }
  if (!content) {
    return <div className="grid min-h-full place-items-center font-display text-2xl text-gold">Unrolling the scrolls…</div>;
  }
  return (
    <ContentContext.Provider value={content}>
      {route.room ? <RoomApp key={`${route.room}:${route.mode}`} room={route.room} mode={route.mode} /> : <Landing />}
    </ContentContext.Provider>
  );
}
