/**
 * Lampa MPV Playlist Plugin v6
 * Queries TorrServer directly for active torrents
 */
(function () {
    'use strict';

    var SCHEME = 'mpvplaylist';

    function getTorrServerHost() {
        return (Lampa.Storage.field('torrserver_url') || 'http://127.0.0.1:8090').replace(/\/$/, '');
    }

    function openInMpv(urls) {
        var m3u = '#EXTM3U\n';
        urls.forEach(function (item, i) {
            m3u += '#EXTINF:-1,' + (item.title || 'Episode ' + (i+1)) + '\n' + item.url + '\n';
        });
        var b64 = btoa(unescape(encodeURIComponent(m3u)));
        window.location.href = SCHEME + '://' + b64 + '?start=0';
    }

    function buildUrlsFromFiles(files, hash, host) {
        var videoExts = /\.(mkv|mp4|avi|mov|wmv|flv|ts|m2ts|webm)$/i;
        var vf = files.filter(function(f){ return videoExts.test(f.path||f.name||''); });
        if (!vf.length) vf = files;
        return vf.map(function(f){
            var idx = f.id !== undefined ? f.id : f.index;
            var name = (f.path||f.name||'episode').split('/').pop().split('\\').pop();
            return {
                title: name,
                url: host+'/stream/'+encodeURIComponent(name)+'?link='+encodeURIComponent(hash)+'&index='+idx+'&play'
            };
        });
    }

    // Get all torrents from TorrServer, find the one matching modal title, open playlist
    function openPlaylistFromTorrServer(titleHint, rowCount) {
        var host = getTorrServerHost();
        Lampa.Noty.show('Ищем торрент в TorrServer...');

        fetch(host + '/torrents', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({action: 'list'})
        })
        .then(function(r){ return r.json(); })
        .then(function(list){
            if (!list || !list.length) { Lampa.Noty.show('TorrServer: нет активных торрентов'); return; }

            // Try to match by title hint, or just take the one with most files matching row count
            var match = null;

            // Try exact/partial title match first
            if (titleHint) {
                list.forEach(function(t) {
                    var tn = (t.title || t.name || '').toLowerCase();
                    var th = titleHint.toLowerCase();
                    if (tn.indexOf(th.substring(0,10)) !== -1 || th.indexOf(tn.substring(0,10)) !== -1) {
                        match = t;
                    }
                });
            }

            // Fallback: pick torrent whose file count matches visible rows
            if (!match) {
                list.forEach(function(t) {
                    var fc = (t.file_stats||t.files||[]).length;
                    if (fc === rowCount) match = t;
                });
            }

            // Last resort: most recently added
            if (!match) match = list[list.length - 1];

            var files = match.file_stats || match.files || [];
            if (!files.length) {
                // Need to fetch full info
                fetch(host + '/torrents', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({action: 'get', hash: match.hash})
                })
                .then(function(r){ return r.json(); })
                .then(function(data){
                    var f2 = data.file_stats || data.files || [];
                    if (!f2.length) { Lampa.Noty.show('Файлы не найдены'); return; }
                    var urls = buildUrlsFromFiles(f2, match.hash, host);
                    Lampa.Noty.show('Открываем ' + urls.length + ' серий в MPV...');
                    setTimeout(function(){ openInMpv(urls); }, 800);
                });
            } else {
                var urls = buildUrlsFromFiles(files, match.hash, host);
                Lampa.Noty.show('Открываем ' + urls.length + ' серий в MPV...');
                setTimeout(function(){ openInMpv(urls); }, 800);
            }
        })
        .catch(function(e){ Lampa.Noty.show('Ошибка TorrServer: ' + e.message); });
    }

    var btnAdded = false;

    function checkForFilesPopup() {
        // Find the "Files" heading text node
        var filesHeading = null;
        $('h2, h3, .head__title, .modal__title, [class*="title"]').each(function() {
            var t = $(this).text().trim();
            if (t === 'Files' || t === 'Файлы' || t === 'Файли') {
                filesHeading = $(this);
                return false;
            }
        });

        if (!filesHeading) { btnAdded = false; return; }

        var container = filesHeading.closest('.modal, .layer--popup, .layer, .popup');
        if (!container.length) container = filesHeading.parent().parent().parent();

        if (container.find('.mpv-btn').length) { btnAdded = true; return; }
        if (btnAdded) return;

        var rows = container.find('.selector').filter(function() {
            return $(this).find('img').length > 0;
        });
        if (rows.length < 2) return;

        btnAdded = true;

        // Get torrent title from the subtitle line (e.g. "Widows Bay S01 WEB-DLRip LF")
        var titleHint = container.find('[class*="sub"], [class*="desc"], [class*="info"]').first().text().trim();
        if (!titleHint) titleHint = document.title || '';

        var btn = $('<div class="mpv-btn selector" style="'
            + 'margin:8px 14px 4px;padding:10px 16px;'
            + 'background:rgba(255,165,0,0.15);border:1px solid rgba(255,165,0,0.4);'
            + 'border-radius:6px;cursor:pointer;display:flex;align-items:center;'
            + 'gap:8px;font-size:14px;color:#fff;box-sizing:border-box;'
            + 'width:calc(100% - 28px);min-height:0;line-height:1.4;">'
            + 'Все серии в MPV (' + rows.length + ')'
            + '</div>');

        btn.on('click', function() {
            openPlaylistFromTorrServer(titleHint, rows.length);
        });

        rows.first().before(btn);
        console.log('[MPV v6] injected, rows=' + rows.length + ', hint=' + titleHint);
    }

    setInterval(checkForFilesPopup, 600);
    console.log('[MPV Playlist v6] loaded ok');
})();
