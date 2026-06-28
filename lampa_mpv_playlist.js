/**
 * Lampa MPV Playlist Plugin v4
 */
(function () {
    'use strict';

    var SCHEME = 'mpvplaylist';
    var currentHash = '';

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
        Lampa.Noty.show('Отправляем ' + urls.length + ' серий в MPV...');
    }

    function fetchAndOpen(hash) {
        var host = getTorrServerHost();
        Lampa.Noty.show('Получаем список файлов...');
        fetch(host + '/torrents', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({action: 'get', hash: hash})
        })
        .then(function(r){ return r.json(); })
        .then(function(data){
            var files = data.file_stats || data.files || [];
            if (!files.length) { Lampa.Noty.show('Файлы не найдены'); return; }
            var videoExts = /\.(mkv|mp4|avi|mov|wmv|flv|ts|m2ts|webm)$/i;
            var vf = files.filter(function(f){ return videoExts.test(f.path||f.name||''); });
            if (!vf.length) vf = files;
            var urls = vf.map(function(f){
                var idx = f.id !== undefined ? f.id : f.index;
                var name = (f.path||f.name||'').split('/').pop().replace(/\\/g,'').split('\\').pop();
                return {
                    title: name,
                    url: host+'/stream/'+encodeURIComponent(name)+'?link='+encodeURIComponent(hash)+'&index='+idx+'&play'
                };
            });
            openInMpv(urls);
        })
        .catch(function(e){ Lampa.Noty.show('Ошибка: '+e.message); });
    }

    // Capture hash from torrent events
    Lampa.Listener.follow('torrent', function(e) {
        try {
            var d = e.data || {};
            if (d.hash) currentHash = d.hash;
            else if (d.magnet) currentHash = d.magnet;
            Lampa.Log && Lampa.Log.add && Lampa.Log.add('MPV', 'torrent event: '+e.type+' hash='+currentHash);
        } catch(ex){}
    });

    // Watch DOM for the Files popup
    var btnAdded = false;

    function checkForFilesPopup() {
        // Look for any element containing the text "Files" as a heading
        var headings = $('h2, .head__title, .modal__title, [class*="title"]');
        var filesHeading = null;
        headings.each(function() {
            if ($(this).text().trim() === 'Files' || $(this).text().trim() === 'Файлы') {
                filesHeading = $(this);
            }
        });

        if (!filesHeading) {
            btnAdded = false;
            return;
        }
        if (btnAdded) return;

        // Find the container that holds the file rows
        // Walk up from heading to find the modal/popup container
        var container = filesHeading.closest('.modal, .layer--popup, .layer, [class*="popup"]');
        if (!container.length) container = filesHeading.parent().parent();

        // Count items that look like file rows (have a number badge 1,2,3...)
        var rows = container.find('.selector').filter(function() {
            return $(this).find('img').length > 0 || $(this).text().trim().length > 3;
        });

        if (rows.length < 2) return;
        if (container.find('.mpv-btn').length) return;

        btnAdded = true;

        var btn = $('<div class="mpv-btn selector" style="'
            + 'margin:8px 14px 2px;padding:11px 16px;'
            + 'background:rgba(255,165,0,0.18);border:1px solid rgba(255,165,0,0.5);'
            + 'border-radius:6px;cursor:pointer;display:flex;align-items:center;'
            + 'gap:10px;font-size:14px;color:#fff;box-sizing:border-box;">'
            + '<svg width="18" height="18" viewBox="0 0 24 24" fill="orange">'
            + '<path d="M8 5v14l11-7z"/></svg>'
            + 'Все серии в MPV (' + rows.length + ')'
            + '</div>');

        btn.on('click', function() {
            if (currentHash) {
                fetchAndOpen(currentHash);
            } else {
                // Try getting hash from Lampa storage/activity
                try {
                    var act = Lampa.Activity.active();
                    var h = act && (act.hash || (act.torrent && act.torrent.hash));
                    if (h) { currentHash = h; fetchAndOpen(h); }
                    else Lampa.Noty.show('Hash не найден. Попробуйте открыть торрент заново.');
                } catch(ex) {
                    Lampa.Noty.show('Ошибка: ' + ex.message);
                }
            }
        });

        // Insert before first file row
        var firstRow = rows.first();
        if (firstRow.length) firstRow.before(btn);
        else container.prepend(btn);

        console.log('[MPV v4] button injected, rows=' + rows.length + ' hash=' + currentHash);
    }

    setInterval(checkForFilesPopup, 600);
    console.log('[MPV Playlist v4] loaded ok');
})();
