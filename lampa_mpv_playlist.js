/**
 * Lampa MPV Playlist Plugin v8
 * Sends playlist to local helper server on port 7777
 */
(function () {
    'use strict';

    var HELPER = 'http://127.0.0.1:7777';

    function getTorrServerHost() {
        return (Lampa.Storage.field('torrserver_url') || 'http://127.0.0.1:8090').replace(/\/$/, '');
    }

    function openInMpv(urls) {
        var m3u = '#EXTM3U\n';
        urls.forEach(function (item, i) {
            m3u += '#EXTINF:-1,' + (item.title || 'Episode ' + (i+1)) + '\n' + item.url + '\n';
        });

        fetch(HELPER + '/play', {
            method: 'POST',
            headers: {'Content-Type': 'text/plain'},
            body: m3u
        })
        .then(function(r){
            if (r.ok) Lampa.Noty.show('MPV запущен с ' + urls.length + ' сериями!');
            else Lampa.Noty.show('Helper ответил ошибкой: ' + r.status);
        })
        .catch(function(e){
            Lampa.Noty.show('Helper недоступен. Запустите mpv_helper.py');
        });
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

    function openPlaylistFromTorrServer(rowCount) {
        var host = getTorrServerHost();
        Lampa.Noty.show('Получаем список файлов...');

        fetch(host + '/torrents', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({action: 'list'})
        })
        .then(function(r){ return r.json(); })
        .then(function(list){
            if (!list || !list.length) { Lampa.Noty.show('TorrServer: нет торрентов'); return; }

            var match = null;
            list.forEach(function(t) {
                var fc = (t.file_stats||t.files||[]).length;
                if (fc === rowCount) match = t;
            });
            if (!match) match = list[list.length - 1];

            function proceed(files) {
                var urls = buildUrlsFromFiles(files, match.hash, host);
                openInMpv(urls);
            }

            var files = match.file_stats || match.files || [];
            if (files.length) {
                proceed(files);
            } else {
                fetch(host + '/torrents', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({action: 'get', hash: match.hash})
                })
                .then(function(r){ return r.json(); })
                .then(function(data){ proceed(data.file_stats || data.files || []); });
            }
        })
        .catch(function(e){ Lampa.Noty.show('Ошибка TorrServer: ' + e.message); });
    }

    var btnAdded = false;

    function checkForFilesPopup() {
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

        var btn = $('<div class="mpv-btn selector" style="'
            + 'margin:8px 14px 4px;padding:10px 16px;'
            + 'background:rgba(255,165,0,0.15);border:1px solid rgba(255,165,0,0.4);'
            + 'border-radius:6px;cursor:pointer;display:flex;align-items:center;'
            + 'gap:8px;font-size:14px;color:#fff;box-sizing:border-box;'
            + 'width:calc(100% - 28px);min-height:0;line-height:1.4;">'
            + 'Все серии в MPV (' + rows.length + ')'
            + '</div>');

        btn.on('click', function() {
            openPlaylistFromTorrServer(rows.length);
        });

        rows.first().before(btn);
    }

    setInterval(checkForFilesPopup, 600);
    console.log('[MPV Playlist v8] loaded ok');
})();
