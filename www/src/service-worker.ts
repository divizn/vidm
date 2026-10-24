/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import {
	cleanupOutdatedCaches,
	createHandlerBoundToURL,
	precacheAndRoute
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { setForUrl } from '$lib/offline/sets';

declare let self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('/')));

registerRoute(
	({ url, sameOrigin }) => sameOrigin && !url.searchParams.has('v') && setForUrl(url.pathname) !== null,
	async ({ request, url }) => {
		const prefix = `vidm-${setForUrl(url.pathname)}-`;
		for (const name of await caches.keys()) {
			if (!name.startsWith(prefix)) continue;
			const cached = await (await caches.open(name)).match(url.pathname);
			if (cached) return cached;
		}
		return fetch(request);
	}
);

self.skipWaiting();
clientsClaim();
