const CACHE_NAME = 'ai-generator-v2';

self.addEventListener('install', (event) => {
    console.log('[SW] Installing...');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('[SW] Activated');
    self.clients.claim();
});

// ===== BACKGROUND IMAGE GENERATION =====
self.addEventListener('message', async (event) => {
    if (event.data.type === 'GENERATE_IMAGES') {
        const { payload } = event.data;
        console.log('[SW] Starting background generation:', payload);
        
        try {
            const response = await fetch(CONFIG.WEBHOOK_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    prompt: payload.prompt,
                    images: payload.images,
                    aspect_ratio: payload.aspect_ratio, // Gửi aspect ratio
                    client_id: payload.id
                }),
                keepalive: true // Quan trọng cho background
            });

            const result = await response.json();
            
            // Forward kết quả về client
            const allClients = await self.clients.matchAll();
            allClients.forEach(client => {
                client.postMessage({
                    type: 'GENERATION_RESULT',
                    success: true,
                    results: result.images || [],
                    payload: payload
                });
            });
            
        } catch (error) {
            console.error('[SW] Generation failed:', error);
            
            const allClients = await self.clients.matchAll();
            allClients.forEach(client => {
                client.postMessage({
                    type: 'GENERATION_RESULT',
                    success: false,
                    error: error.message
                });
            });
        }
    }
});

// Cache static assets
self.addEventListener('fetch', (event) => {
    if (event.request.url.includes('cdn.jsdelivr.net')) {
        event.respondWith(
            caches.match(event.request).then(response => 
                response || fetch(event.request)
            )
        );
    }
});
