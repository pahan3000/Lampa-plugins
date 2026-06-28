/**
 * Lampa MPV Playlist Plugin
 * Adds "Все серии в MPV" button to torrent file list.
 */

(function () {
    'use strict';

    var SCHEME = 'mpvplaylist';

    function buildStreamUrl(hash, fileIndex) {
        var host = (Lampa.Storage.field('torrserver_url') || 'http://127.0.0.1:8090').replace(/\/$/, '');
        return host + '/stream/file.mkv?link=' + encodeURIComponent(hash) + '&index=' + fileIndex + '&play';
    }

    function openInMpv(items) {
        var m3u = '#EXTM3U\n';
        items.forEach(function (item) {
            m3u += '#EXTINF:-1,' + (item.title || 'Episode') + '\n' + item.url + '\n';
        });
        var b64 = btoa(unescape(encodeURIComponent(m3u)));
        window.location.href = SCHEME + '://' + b64 + '?start=0';
        Lampa.Noty.show('Отправляем плейлист в MPV...');
    }

    function addButton(files, hash) {
        // Remove old button if any
        $('.mpv-all-btn').remove();

        var btn = $('<div class="mpv-all-btn selector" style="'
            + 'margin:8px 16px;padding:10px 16px;background:rgba(255,255,255,0.1);'
            + 'border-radius:6px;cursor:pointer;display:flex;align-items:center;gap:8px;font-size:14px;">'
            + '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'
            + 'Все серии в MPV (' + files.length + ')'
            + '</div>');

        btn.on('click', function () {
            var items = files.map(function (f, i) {
                return {
                    title: f.name || ('Episode ' + (i + 1)),
                    url: buildStreamUrl(hash, f.index !== undefined ? f.index : i)
                };
            });
            openInMpv(items);
        });

        // Try multiple possible selectors for the file list container
        var container = $('.files-list, .torrent-files, [class*="files__"]').first();
        if (container.length) {
            container.prepend(btn);
        } else {
            // fallback: prepend to whatever modal is open
            $('.layer--popup .layer__body, .modal .scroll__content').last().prepend(btn);
        }
    }

    // Hook into Lampa's torrent event
    Lampa.Listener.follow('torrent', function (e) {
        if (e.type === 'open' && e.data && e.data.files && e.data.files.length > 1) {
            setTimeout(function () {
                addButton(e.data.files, e.data.hash || e.data.magnet || '');
            }, 400);
        }
    });

    // Also watch for any modal that looks like a file list (fallback)
    var lastCheck = 0;
    document.addEventListener('click', function () {
        setTimeout(function () {
            var now = Date.now();
            if (now - lastCheck < 1000) return;
            lastCheck = now;

            var rows = $('[class*="file"]:visible').filter(function () {
                return $(this).text().trim().length > 0;
            });
            if (rows.length > 1 && !$('.mpv-all-btn').length) {
                // We see file rows but no button — try to get torrent info from Lampa
                try {
                    var activity = Lampa.Activity.active();
                    if (activity && activity.torrent) {
                        var t = activity.torrent;
                        addButton(t.files || [], t.hash || '');
                    }
                } catch(e) {}
            }
        }, 500);
    });

    console.log('[MPV Playlist] loaded ok');
})();
