/**
 * Lampa MPV Playlist Plugin
 * Adds an "Open all in MPV" button to the torrent file list.
 * Requires the companion helper (mpv_playlist_helper.bat + registry setup) on Windows.
 *
 * Install: Settings → Extensions → Add plugin URL
 * GitHub Pages / local server URL pointing to this file.
 */

(function () {
    'use strict';

    // ─── CONFIG ──────────────────────────────────────────────────────────────
    // Custom URL scheme registered by the companion helper.
    var SCHEME = 'mpvplaylist';

    // ─── HELPERS ─────────────────────────────────────────────────────────────

    /**
     * Build a TorrServer stream URL for a given file index.
     * TorrServer is the backend Lampa uses for torrent streaming.
     * URL pattern: http://<host>/stream/<title>?link=<hash>&index=<n>&play
     */
    function buildStreamUrl(torrentInfo, fileIndex) {
        var host = Lampa.Storage.field('torrserver_url') || 'http://127.0.0.1:8090';
        // Strip trailing slash
        host = host.replace(/\/$/, '');
        var hash = torrentInfo.hash || torrentInfo.magnet || '';
        var title = encodeURIComponent(torrentInfo.title || 'episode');
        return host + '/stream/' + title + '?link=' + encodeURIComponent(hash) + '&index=' + fileIndex + '&play';
    }

    /**
     * Given an array of {url, title} objects, encode them as a simple M3U
     * and pass it through the custom URL scheme so the helper can write it
     * to disk and launch MPV.
     */
    function openInMpv(items, startIndex) {
        startIndex = startIndex || 0;

        // Build M3U content
        var m3u = '#EXTM3U\n';
        items.forEach(function (item) {
            m3u += '#EXTINF:-1,' + (item.title || 'Episode') + '\n';
            m3u += item.url + '\n';
        });

        // Encode as base64 so it survives the URL
        var b64 = btoa(unescape(encodeURIComponent(m3u)));

        // mpvplaylist://<base64_m3u>?start=<index>
        var launchUrl = SCHEME + '://' + b64 + '?start=' + startIndex;

        // Open the custom scheme — the registered helper will catch it
        window.location.href = launchUrl;

        Lampa.Noty.show('Передаём плейлист в MPV…');
    }

    // ─── UI BUTTON ───────────────────────────────────────────────────────────

    /**
     * Inject the "▶ Все в MPV" button into Lampa's torrent file-list modal.
     * We hook the DOM because Lampa doesn't expose a public file-list API.
     */
    function injectButton(modal, torrentInfo, files) {
        // Avoid double-inject
        if (modal.find('.mpv-playlist-btn').length) return;

        var btn = $('<div class="mpv-playlist-btn selector" style="'
            + 'display:flex;align-items:center;justify-content:center;'
            + 'margin:0.5em 1em 0;padding:0.6em 1em;'
            + 'background:rgba(255,255,255,0.08);border-radius:0.4em;'
            + 'cursor:pointer;font-size:1em;gap:0.5em;">'
            + '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">'
            + '<path d="M8 5v14l11-7z"/></svg>'
            + 'Все серии в MPV'
            + '</div>');

        btn.on('click', function () {
            var items = files.map(function (f, i) {
                return {
                    title: f.name || ('Episode ' + (i + 1)),
                    url: buildStreamUrl(torrentInfo, f.index !== undefined ? f.index : i)
                };
            });
            openInMpv(items, 0);
        });

        // Insert before the first file row
        var firstRow = modal.find('.files-list__item, .torrent-item, .file-row').first();
        if (firstRow.length) {
            firstRow.before(btn);
        } else {
            modal.find('.files-list, .torrent-files, [class*="files"]').first().prepend(btn);
        }
    }

    // ─── LAMPA EVENT HOOKS ───────────────────────────────────────────────────

    /**
     * Lampa fires 'torrent_files' (or similar) when the file list modal opens.
     * We also watch for DOM changes as a fallback since the exact event name
     * can vary between Lampa builds.
     */

    // Hook 1 — Lampa event bus
    Lampa.Listener.follow('torrent', function (e) {
        if (e.type === 'open_files' || e.type === 'files') {
            var data = e.data || {};
            var torrentInfo = data.torrent || data;
            var files = data.files || [];

            // Wait one tick for the modal DOM to render
            setTimeout(function () {
                var modal = $('[data-component="files"], .modal--files, .files-wrap').last();
                if (modal.length && files.length > 1) {
                    injectButton(modal, torrentInfo, files);
                }
            }, 300);
        }
    });

    // Hook 2 — MutationObserver fallback (catches any modal with file rows)
    var observer = new MutationObserver(function (mutations) {
        mutations.forEach(function () {
            // Look for a file list modal that has appeared
            var modal = $('[data-component="files"]:visible, .modal:visible').filter(function () {
                return $(this).find('[class*="file"]').length > 1;
            }).last();

            if (!modal.length || modal.find('.mpv-playlist-btn').length) return;

            // Try to read torrent info from Lampa's current context
            var torrentData = null;
            try {
                torrentData = Lampa.Activity.active() && Lampa.Activity.active().component
                    && Lampa.Activity.active().component.current_torrent;
            } catch (e) { /* ignore */ }

            if (!torrentData) return;

            var files = [];
            modal.find('[class*="file-item"], [class*="files__item"], .selector').each(function (i) {
                var name = $(this).find('[class*="name"], .title').text().trim();
                if (name) files.push({ name: name, index: i });
            });

            if (files.length > 1) {
                injectButton(modal, torrentData, files);
            }
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // ─── SETTINGS PANEL ──────────────────────────────────────────────────────

    Lampa.SettingsApi.addParam({
        component: 'interface',
        param: {
            name: 'mpv_playlist_info',
            type: 'static',
            default: ''
        },
        field: {
            name: 'MPV Playlist Plugin',
            description: 'Добавляет кнопку "Все серии в MPV" в список файлов торрента. '
                + 'Требует установки companion helper (mpv_playlist_helper.bat).'
        }
    });

    console.log('[MPV Playlist] Plugin loaded');
})();
