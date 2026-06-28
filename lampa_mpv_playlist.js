/**
 * Lampa MPV Playlist Plugin v5
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
                var name = (f.path||f.name||'episode').split('/').pop().split('\\').pop();
                return {
                    title: name,
                    url: host+'/stream/'+encodeURIComponent(name)+'?link='+encodeURIComponent(hash)+'&index='+idx+'&play'
                };
            });
            openInMpv(urls);
        })
        .catch(function(e){ Lampa.Noty.show('Ошибка: '+e.message); });
    }

    function tryGetHash() {
        if (currentHash) return currentHash;
        try {
            var act = Lampa.Activity.active();
            if (act) {
                return act.hash || act.magnet
                    || (act.torrent && (act.torrent.hash || act.torrent.magnet))
                    || (act.item && act.item.hash)
                    || '';
            }
        } catch(e) {}
        return '';
    }

    // Capture hash from ALL lampa events
    ['torrent','player','full'].forEach(function(evName) {
        Lampa.Listener.follow(evName, function(e) {
            try {
                var d = e.data || e || {};
                var h = d.hash || d.magnet
                    || (d.torrent && (d.torrent.hash || d.torrent.magnet))
                    || (d.item && d.item.hash)
                    || '';
                if (h) currentHash = h;
            } catch(ex){}
        });
    });

    var btnAdded = false;

    function checkForFilesPopup() {
        var filesHeading = null;
        $('*').each(function() {
            var t = $(this).text().trim();
            if ((t === 'Files' || t === 'Файлы') && $(this).children().length === 0) {
                filesHeading = $(this);
                return false;
            }
        });

        if (!filesHeading) { btnAdded = false; return; }
        if (btnAdded) return;

        var container = filesHeading.closest('.modal, .layer--popup, .layer, .popup');
        if (!container.length) container = $('body');

        if (container.find('.mpv-btn').length) { btnAdded = true; return; }

        var rows = container.find('.selector').filter(function() {
            return $(this).find('img').length > 0;
        });
        if (rows.length < 2) return;

        btnAdded = true;

        var btn = $('<div class="mpv-btn selector" style="'
            + 'margin:8px 14px 4px;padding:10px 16px;'
            + 'background:rgba(255,165,0,0.15);border:1px solid rgba(255,165,0,0.4);'
            + 'border-radius:6px;cursor:pointer;display:flex;align-items:center;'
            + 'gap:8px;font-size:14px;color:#fff;box-sizing:border-box;width:calc(100% - 28px);">'
            + '<span style="font-size:18px;line-height:1;">▶</span>'
            + '<span>Все серии в MPV (' + rows.length + ')</span>'
            + '</div>');

        btn.on('click', function() {
            var h = tryGetHash();
            if (h) {
                fetchAndOpen(h);
            } else {
                // Last resort: scrape visible row titles and build URLs by index
                var urls = [];
                rows.each(function(i) {
                    var title = $(this).find('.torrent-item__title, .title, [class*="title"]').first().text().trim() || ('Episode ' + (i+1));
                    var host = getTorrServerHost();
                    urls.push({ title: title, url: host+'/stream/episode.mkv?index='+i+'&play' });
                });
                Lampa.Noty.show('Hash не найден, используем индексы...');
                openInMpv(urls);
            }
        });

        var firstRow = rows.first();
        if (firstRow.length) firstRow.before(btn);
        else container.prepend(btn);

        console.log('[MPV v5] button injected rows='+rows.length);
    }

    setInterval(checkForFilesPopup, 600);
    console.log('[MPV Playlist v5] loaded ok');
})();
