const CACHE_NAME='moviefinder-shell-v1';
const SHELL=['/','/manifest.webmanifest','/icons/moviefinder.svg'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET') return;
  const url=new URL(request.url);

  // Search/API data stays network-first and is never written to the shell cache.
  if(url.origin===self.location.origin&&url.pathname.startsWith('/api/')){
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith(
    fetch(request)
      .then(response=>{
        if(response.ok&&url.origin===self.location.origin){
          const copy=response.clone();
          caches.open(CACHE_NAME).then(cache=>cache.put(request,copy));
        }
        return response;
      })
      .catch(()=>caches.match(request).then(hit=>hit||caches.match('/')))
  );
});
