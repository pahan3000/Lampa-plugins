/**
 * Lampa MPV Playlist Plugin v3
 * Injects "Все серии в MPV" button into torrent file list
 */

(function () {
    'use strict';

    var SCHEME = 'mpvplaylist';

    function buildM3U(urls) {
        var m3u = '#EXTM3U\n';
        urls.forEach(function (item, i) {
            m3u += '#EXTINF:-1,' + (item.title || 'Episode ' + (i + 1)) + '\n';
            m3u += item.url + '\n';
        });
        return m3u;
    }

    function openInMpv(urls) {
        if (!urls.length) return;
        var m3u = buildM3U(urls);
        var b64 = btoa(unescape(encodeURIComponent(m3u)));
        var href = SCHEME + '://' + b64 + '?start=0';
        window.location.href = href;
        Lampa.Noty.show('Отправляем ' + urls.length + ' серий в MPV...');
    }

    function getTorrServerHost() {
        return (Lampa.Storage.field('torrserver_url') || 'http://127.0.0.1:8090').replace(/\/$/, '');
    }

    // Ask TorrServer for the file list of current torrent hash
    function fetchFilesAndOpen(hash) {
        var host = getTorrServerHost();
        // TorrServer API: POST /torrents with action=get returns torrent info including file list
        fetch(host + '/torrents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'get', hash: hash })
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            var files = data.file_stats || data.files || [];
            if (!files.length) {
                Lampa.Noty.show('Не удалось получить список файлов');
                return;
            }
            // Filter to video files only
            var videoExts = /\.(mkv|mp4|avi|mov|wmv|flv|ts|m2ts|webm)$/i;
            var videoFiles = files.filter(function(f) {
                return videoExts.test(f.path || f.name || '');
            });
            if (!videoFiles.length) videoFiles = files;

            var urls = videoFiles.map(function(f) {
                var idx = f.id !== undefined ? f.id : f.index;
                var name = (f.path || f.name || '').split('/').pop().split('\\').pop();
                var url = host + '/stream/' + encodeURIComponent(name)
                    + '?link=' + encodeURIComponent(hash)
                    + '&index=' + idx + '&play';
                return { title: name, url: url };
            });
            openInMpv(urls);
        })
        .catch(function(e) {
            Lampa.Noty.show('Ошибка TorrServer: ' + e.message);
        });
    }

    // Watch for the Files modal to appear and inject button
    var injected = false;

    function tryInject() {
        // The Files modal title contains "Files" or "Файлы"
        var modal = null;
        $('.modal, .layer--popup').each(function() {
            var title = $(this).find('.modal__title, .head__title, h2').text().trim();
            if (title === 'Files' || title === 'Файлы' || title === 'Файли') {
                modal = $(this);
            }
        });

        if (!modal) {
            injected = false;
            return;
        }
        if (injected) return;
        injected = true;

        // Count file rows
        var rows = modal.find('.files-list__item, .torrent-item, .selector').filter(function() {
            return $(this).find('img, .title, .name').length > 0;
        });
        if (rows.length < 2) return;

        // Get hash from Lampa's current torrent context
        var hash = '';
        try {
            // Try various places Lampa stores the active torrent
            var act = Lampa.Activity.active();
            if (act) {
                hash = (act.torrent && act.torrent.hash)
                    || (act.movie && act.movie.torrent_hash)
                    || act.hash || '';
            }
        } catch(e) {}

        // Also try reading hash from the torrent list visible behind modal
        if (!hash) {
            try {
                hash = window._lampa_current_torrent_hash || '';
            } catch(e) {}
        }

        var btn = $('<div class="selector" style="'
            + 'margin:10px 16px 4px;padding:12px 16px;'
            + 'background:rgba(255,180,0,0.15);border:1px solid rgba(255,180,0,0.4);'
            + 'border-radius:6px;cursor:pointer;display:flex;align-items:center;'
            + 'gap:10px;font-size:15px;color:#fff;">'
            + '<svg width="20" height="20" viewBox="0 0 24 24" fill="#ffb400">'
            + '<path d="M8 5v14l11-7z"/></svg>'
            + '<span>▶ Все серии в MPV (' + rows.length + ')</span>'
            + '</div>');

        btn.on('click', function() {
            if (hash) {
                fetchFilesAndOpen(hash);
            } else {
                // Fallback: build URLs from visible row titles using index
                var urls = [];
                rows.each(function(i) {
                    var title = $(this).find('.title, .name, [class*="title"]').first().text().trim()
                        || ('Episode ' + (i + 1));
                    urls.push({ title: title, url: getTorrServerHost() + '/stream/episode.mkv?index=' + i + '&play' });
                });
                openInMpv(urls);
            }
        });

        // Insert at top of file list
        var list = modal.find('.files-list, .scroll__content, .layer__body').first();
        if (list.length) {
            list.prepend(btn);
        } else {
            modal.prepend(btn);
        }
    }

    // Hook torrent listener to capture hash before modal opens
    Lampa.Listener.follow('torrent', function(e) {
        if (e.data && (e.data.hash || e.data.magnet)) {
            window._lampa_current_torrent_hash = e.data.hash || e.data.magnet || '';
        }
    });

    // Poll for the modal every 500ms
    setInterval(tryInject, 500);

    console.log('[MPV Playlist v3] loaded');
})();
