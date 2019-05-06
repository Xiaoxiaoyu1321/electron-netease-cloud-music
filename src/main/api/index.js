import fs from 'fs';
import url from 'url';
import path from 'path';
import crypto from 'crypto';
import qs from 'querystring';
import cp from 'child_process';
import { app } from 'electron';

import { Lrc } from 'lrc-kit';

import Cache from './cache';
import Client from './httpClient';
import * as Settings from '../settings';
import MusicServer from './musicServer';

const fsPromises = fs.promises;
const BaseURL = 'https://music.163.com';
const client = new Client();

const dataPath = app.getPath('userData');
const CachePath = {
    all: dataPath,
    music: path.join(dataPath, 'musicCache'),
    lyric: path.join(dataPath, 'lyricCache')
};
const musicCache = new Cache(CachePath.music);
const lyricCache = new Cache(CachePath.lyric);

const musicServer = new MusicServer(musicCache);
let musicServerPort = 0;
musicServer.listen().then(addr => musicServerPort = addr.port);

/**
 * clear all cookies, and set cookie as given arguments
 * @param {string | string[] | Record<string, string>} [cookie]
 */
export function updateCookie(cookie) {
    client.updateCookie(cookie);
}

/**
 * @param {string} [key]
 * @returns {string | Record<string, string>}
 */
export function getCookie(key) {
    return client.getCookie(key);
}

/**
 * @param {string} acc email, username or phone
 * @param {string} pwd password
 * @returns {Promise<Types.LoginRes>}
 */
export function login(acc, pwd) {
    const password = crypto.createHash('md5').update(pwd).digest('hex');
    const postBody = {
        password,
        rememberLogin: true,
    };
    if (/^1\d{10}$/.test(acc)) {
        return client.postW('/login/cellphone', { phone: acc, ...postBody });
    } else {
        return client.postW('/login', { username: acc, ...postBody });
    }
}

export function refreshLogin() {
    return client.postW('/login/token/refresh');
}

export async function logout() {
    const resp = await client.postW('/logout');
    if (resp.code === 200) {
        client.updateCookie();
    }
    return resp.code;
}

/**
 * @param {number} uid
 * @returns {Promise<Types.UserPlaylistRes>}
 */
export function getUserPlaylist(uid) {
    return client.postW('/user/playlist', {
        uid,
        offset: 0,
        limit: 1000,
    });
}

/**
 * 用户听歌记录
 * @param {number} uid
 * @param {0|1} type `0`: 所有时间, `1`: 最近一周
 */
export function getMusicRecord(uid, type = 0) {
    return client.postW('/v1/play/record', {
        limit: 1000,
        offset: 0,
        total: true,
        type,
        uid,
    });
}

/**
 * 每日歌曲推荐
 * @returns {Promise<Types.RecommendSongsRes>}
 */
export function getRecommendSongs() {
    return client.postW('/v2/discovery/recommend/songs', {
        limit: 20,
        offset: 0,
        total: true
    });
}

/** 
 * 每日歌曲推荐 -> 不感兴趣
 * @param {number} id
 * @returns {Promise<Types.DislikeRecommendRes>}
 */
export function dislikeRecommend(id) {
    return client.postW('/v2/discovery/recommend/dislike', {
        resId: id,
        resType: 4,
        sceneType: 1
    });
}

/**
 * 推荐歌单，登录后可用
 * @returns {Promise<Types.RecommendPlaylistRes>}
 */
export function getRecommendPlaylist() {
    return client.postW('/v1/discovery/recommend/resource');
}

/**
 * 推荐歌单 -> 不感兴趣
 * @param {number} id
 * @param {'bysong_rt'|'hotbased'} alg `bysong_rt`: 根据收藏的单曲推荐, `hotbased`: 热门推荐
 */
export function dislikePlaylist(id, alg) {
    return client.postW('/v2/discovery/recommend/dislike', {
        resId: id,
        resType: 1,
        type: alg
    });
}

/**
 * 包含歌曲列表的歌单详情，最多能获取前 1000 首，不能分页
 * @param {number} id
 * @param {number} [n=1000] 歌曲详情的数量，默认为 `1000`
 * @returns {Promise<Types.ListDetailRes>}
 */
export function getListDetail(id, n = 1000) {
    return client.postW('/v3/playlist/detail', { id, n });
}

/**
 * 包含歌曲列表的歌单详情，最多能获取前 1000 首，不能分页
 * @param {number} id
 * @param {number} [n=1000] 歌曲详情的数量，默认为 `1000`
 * @returns {Promise<Types.ListDetailRes>}
 */
export function getListDetailE(id, n = 1000) {
    return client.postE('/v3/playlist/detail', { id, n });
}

/**
 * 批量查询歌曲详情, 最多 1000 首
 * @param {number[]} ids
 * @returns {Promise<Types.SongDetailRes>}
 */
export function getSongDetail(ids) {
    return client.postW('/v3/song/detail', {
        c: `[${ids.map(id => JSON.stringify({ id }))}]`,
        // ids: `[${ ids }]`
    });
}

const QualityMap = {
    h: 320000,
    m: 192000,
    l: 128000
};

/**
 * temporary music url on netease's server
 * @param {number|number[]} idOrIds
 * @param {Types.MusicQuality} quality
 * @returns {Promise<Types.MusicUrlRes>}
 */
export function getMusicUrlW(idOrIds, quality) {
    if (!QualityMap[quality]) throw new Error(`Quality type '${quality}' is not in [h,m,l]`);
    let ids;
    if (Array.isArray(idOrIds)) ids = idOrIds;
    else ids = [idOrIds];
    return client.postW('/song/enhance/player/url', {
        ids,
        br: QualityMap[quality],
    });
}

/**
 * music url with 'linux/forward' api
 * @param {number|number[]} idOrIds
 * @param {Types.MusicQuality} quality
 * @returns {Promise<Types.MusicUrlRes>}
 */
export function getMusicUrlL(idOrIds, quality) {
    if (!QualityMap[quality]) throw new Error(`Quality type '${quality}' is not in [h,m,l]`);
    let ids;
    if (Array.isArray(idOrIds)) ids = idOrIds;
    else ids = [idOrIds];
    return client.postL('/api/song/enhance/player/url', {
        ids,
        br: QualityMap[quality],
    });
}

/**
 * music url, eapi
 * @param {number|number[]} idOrIds
 * @param {Types.MusicQuality} quality
 * @returns {Promise<Types.MusicUrlRes>}
 */
export function getMusicUrlE(idOrIds, quality) {
    if (!QualityMap[quality]) throw new Error(`Quality type '${quality}' is not in [h,m,l]`);
    let ids;
    if (Array.isArray(idOrIds)) ids = idOrIds;
    else ids = [idOrIds];
    return client.postE('/song/enhance/player/url', {
        ids,
        br: QualityMap[quality],
    });
}

/**
 * get musicServer's music url
 * @param {number} id
 * @param {Types.MusicQuality} quality
 * @param {boolean} [ignoreCache=false]
 * @returns {Promise<Types.MusicUrlLocalRes>}
 */
export async function getMusicUrlLocal(id, quality, ignoreCache = false) {
    return {
        url: url.format({
            protocol: 'http:',
            hostname: 'localhost',
            port: musicServerPort,
            pathname: '/music',
            query: ignoreCache ? { id, quality, ignoreCache } : { id, quality }
        })
    };
}

const Comments = {
    threadRegexp: /^\w_\w\w_(?<resType>\d{1,2})_(?<rid>\w+)$/
};

/**
 * get comments by thread id
 * @param {string} thread
 * @param {number} limit
 * @param {number} offset
 * @returns {Promise<Types.CommentsRes>}
 */
export function getComments(thread, limit = 20, offset = 0) {
    const { rid } = thread.match(Comments.threadRegexp).groups;
    return client.postW(`/v1/resource/comments/${thread}`, { rid, offset, limit });
}

/**
 * get hot comments by thread id
 * @param {string} thread
 * @param {number} limit
 * @param {number} offset
 * @returns {Promise<Types.HotCommentsRes>}
 */
export function getHotComments(thread, limit = 20, offset = 0) {
    const { rid } = thread.match(Comments.threadRegexp).groups;
    return client.postW(`/v1/resource/hotcomments/${thread}`, { rid, offset, limit });
}

/**
 * **DO NOT USE**
 * @param {string} threadId
 * @param {number} commentId
 * @returns {Promise<Types.LikeCommentRes>}
 */
export function likeComment(threadId, commentId) {
    return client.postW('/v1/comment/like', { threadId, commentId });
}

/**
 * @param {string} threadId
 * @param {number} commentId
 * @returns {Promise<Types.ApiRes>}
 */
export function unlikeComment(threadId, commentId) {
    return client.postW('/v1/comment/unlike', { threadId, commentId });
}

/**
 * @param {string} threadId
 * @param {number} commentId
 * @returns {Promise<Types.ApiRes>}
 */
export function likeCommentE(threadId, commentId) {
    return client.postE('/v1/comment/like', { threadId, commentId });
}

/**
 * @param {string} threadId
 * @param {number} commentId
 * @returns {Promise<Types.ApiRes>}
 */
export function unlikeCommentE(threadId, commentId) {
    return client.postE('/v1/comment/unlike', { threadId, commentId });
}

/**
 * post comment to thread
 * @param {string} threadId
 * @param {string} content
 * @returns {Promise<Types.AddCommentRes>}
 */
export function addComment(threadId, content) {
    return client.postW('/resource/comments/add', { threadId, content });
}

/**
 * delete comment from thread
 * @param {string} threadId
 * @param {number} commentId
 * @returns {Promise<Types.ApiRes>}
 */
export function deleteComment(threadId, commentId) {
    return client.postW('/resource/comments/delete', { threadId, commentId });
}

/**
 * @param {string} threadId
 * @param {number} commentId
 * @param {string} content
 * @returns {Promise<Types.AddCommentRes>}
 */
export function replyCommentE(threadId, commentId, content) {
    const { resType: resourceType } = threadId.match(Comments.threadRegexp).groups;
    return client.postE('/v1/resource/comments/reply', { threadId, commentId, content, resourceType });
}

const MusicLyric = {
    byTimestamp(a, b) {
        return a.timestamp - b.timestamp;
    }
};

/**
 * @param {number} id
 * @returns {Promise<Types.MusicLyricRes>}
 */
export async function getMusicLyric(id) {
    const tmp = await client.postE('/song/lyric', { id, lv: 0, tv: 0, kv: 0 });
    let result = {};
    if (tmp.lrc && tmp.lrc.lyric) {
        const lrc = Lrc.parse(tmp.lrc.lyric);
        if (lrc.lyrics.length > 0) {
            lrc.lyrics.sort(MusicLyric.byTimestamp);
            result.lrc = lrc;
        } else {
            result.txtLyric = tmp.lrc.lyric;
        }
        result.lyricUser = tmp.lyricUser;
    }
    if (tmp.tlyric && tmp.tlyric.lyric) {
        result.transUser = tmp.transUser;
        let tlrc = Lrc.parse(tmp.tlyric.lyric);
        tlrc.lyrics.sort(MusicLyric.byTimestamp);
        let mlrc = {
            info: result.lrc.info,
            transInfo: tlrc.info,
            lyrics: result.lrc.lyrics.slice()
        };
        let i = 0;
        let j = 0;
        while (i < mlrc.lyrics.length && j < tlrc.lyrics.length) {
            if (mlrc.lyrics[i].timestamp === tlrc.lyrics[j].timestamp) {
                mlrc.lyrics[i].trans = tlrc.lyrics[j].content;
                i++; j++;
            } else if (mlrc.lyrics[i].timestamp < tlrc.lyrics[j].timestamp) {
                i++;
            } else {
                j++;
            }
        }
        result.mlrc = mlrc;
    }
    return result;
}

/**
 * @param {number} id
 * @param {boolean} ignoreCache
 * @returns {Promise<Types.MusicLyricRes>}
 */
export async function getMusicLyricCached(id, ignoreCache = false) {
    const hasCache = await lyricCache.has(id.toString());
    if (hasCache && !ignoreCache) {
        const pathname = lyricCache.fullPath(id);
        const text = await fsPromises.readFile(pathname, 'utf8');
        return JSON.parse(text);
    } else {
        const lyric = await getMusicLyric(id);
        lyricCache.save(id.toString(), lyric);
        return lyric;
    }
}

/**
 * this maybe have been removed, use `sumbitFeedback` instead
 */
export function submitWebLog(action, json) {
    return client.postW('/log/web', {
        action,
        json: JSON.stringify(json),
    });
}

/**
 * @param {any} logs
 * @returns {Promise<Types.ApiRes>}
 */
export function sumbitFeedback(logs) {
    return client.postW('/feedback/weblog', {
        logs: JSON.stringify(logs),
    });
}

export function submitCount() {
    return client.postW('/pl/count');
}

/**
 * tell netease I've finished listening a song
 * @param {number} id
 * @param {number} time song duration, in seconds
 * @param {{name: string; id: string}} source
 */
export function submitListened(id, time, source) {
    let json = {
        type: 'song',
        wifi: 0,
        download: 0,
        id,
        time: Math.floor(time),
        end: 'ui'
    };
    if (source && source.id && source.name) {
        json.source = source.name;
        json.sourceId = `${source.id}`;
    }
    return sumbitFeedback([{ action: 'play', json }]);
}

export function getVipInfo() {
    return client.postW('/music-vip-membership/front/vip/info');
}

/**
 * get disk usage of file or directory
 * @param {string} pathname
 * @returns {Promise<number>}
 */
export function getDiskUsage(pathname) {
    return new Promise((resolve, reject) => {
        fsPromises.lstat(pathname).then(stat => {
            if (stat.isSymbolicLink() || stat.isFile()) {
                resolve(stat.size);
            } else if (stat.isDirectory()) {
                fsPromises.readdir(pathname).then(files => {
                    const p = files.map(file => getDiskUsage(path.join(pathname, file)));
                    Promise.all(p).then(sizes => {
                        const tot = sizes.reduce((a, b) => a + b, 0);
                        resolve(tot);
                    }).catch(reject);
                });
            }
        }).catch(reject);
    });
}

export function removeRecursive(pathname) {
    return new Promise((resolve, reject) => {
        fsPromises.lstat(pathname).then(stat => {
            if (stat.isSymbolicLink() || stat.isFile()) {
                fsPromises.unlink(pathname).then(resolve).catch(reject);
            } else if (stat.isDirectory()) {
                fsPromises.readdir(pathname).then(files => {
                    const p = files.map(file => removeRecursive(path.join(pathname, file)));
                    Promise.all(p).then(resolve).catch(reject);
                });
            }
        }).catch(reject);
    });
}

/**
 * get size of cached data in bytes
 * @param {'all'|'music'|'lyric'} type cache type
 * @returns {Promise<{ok: boolean; size: number; msg?: string}>}
 */
export async function getDataSize(type) {
    const cachePath = CachePath[type];
    try {
        const size = await getDiskUsage(cachePath);
        return { ok: true, size };
    } catch (e) {
        console.error(e); // eslint-disable-line no-console
        return {
            ok: false,
            size: 0,
            msg: e.stack
        };
    }
}

/**
 * @param {'all'|'music'|'lyric'} type cache type
 * @returns {Promise<{ok: boolean; msg?: string}>}
 */
export async function clearCache(type) {
    try {
        await removeRecursive(CachePath[type]);
    } catch (e) {
        return {
            ok: false,
            msg: e.stack
        };
    }
    return { ok: true };
}

/**
 * @param {string} command
 */
function execAsync(command) {
    return new Promise((resolve, reject) => {
        cp.exec(command, (err, stdout, stderr) => {
            if (err) {
                reject({ stderr, stack: err.stack });
                return;
            }
            resolve(stdout.trim());
        });
    });
}

/**
 * @returns {Promise<string>}
 */
export async function getVersionName() {
    let version = app.getVersion();
    if (process.env.NODE_ENV === 'development') {
        try {
            const hash = await execAsync('git rev-parse --short HEAD');
            return `${version}-git.${hash}.dev`;
        } catch (e) {
            return `${version}.dev`;
        }
    }
    return version;
}

/**
 * @returns {typeof Settings.defaultSettings}
 */
export function getCurrentSettings() {
    return Settings.get();
}

/**
 * write and save settings to file
 * @param {typeof Settings.defaultSettings} target settings to write
 */
export function writeSettings(target) {
    Settings.set(target);
}

export function resetSettings() {
    Settings.set(Settings.defaultSettings);
}

/**
 * 每日签到
 * @param {0|1} type `0`:移动端, `1`:桌面/网页端
 * @returns {Promise<Types.DailyTaskRes>}
 */
export function postDailyTask(type) {
    return client.postW('/point/dailyTask', { type });
}

/**
 * eapi 签到
 * @param {0|1} type `0`:移动端, `1`:桌面/网页端
 * @param {number} adid
 * @returns {Promise<Types.DailyTaskRes>}
 */
export function postDailyTaskE(type, adid = 0) {
    return client.postE('/point/dailyTask', { type, adid });
}

/**
 * 获取签到状态
 * @returns {Promise<Types.GetDailyTaskRes>}
 */
export function getDailyTask() {
    return client.postW('/point/getDailyTask');
}

/**
 * add or remove tracks in playlist
 * @param {'add'|'del'} op opreation
 * @param {number} pid playlist id
 * @param {number[]} tracks track id
 */
export function manipulatePlaylistTracks(op, pid, tracks) {
    return client.postW('/playlist/manipulate/tracks', {
        op,
        pid,
        // tracks,
        trackIds: JSON.stringify(tracks),
    });
}

/**
 * add tracks to playlist
 * @param {number} pid playlist id
 * @param {number[]} tracks track to add
 * @returns {Promise<Types.CollectTrackRes>}
 */
export function collectTrack(pid, ...tracks) {
    return manipulatePlaylistTracks('add', pid, tracks);
}

/**
 * remove tracks from playlist
 * @param {number} pid playlist id
 * @param {number[]} tracks track to remove
 * @returns {Promise<Types.UncollectTrackRes>}
 */
export function uncollectTrack(pid, ...tracks) {
    return manipulatePlaylistTracks('del', pid, tracks);
}

/**
 * @param {string} s keyword
 * @returns {Promise<Types.SearchSuggestRes>}
 */
export function getSearchSuggest(s) {
    return client.postW('/search/suggest/web', { s });
}

const searchTypeMap = {
    song: '1',
    album: '10',
    artist: '100',
    playlist: '1000',
    user: '1002',
    mv: '1004',
    lyric: '1006',
    radio: '1009',
    video: '1014'
};

/**
 * preform search
 * @param {string} s keyword
 * @param {'song'|'album'|'artist'|'playlist'|'user'|'mv'|'lyric'|'radio'|'video'} type
 * @param {number} limit
 * @param {number} offset
 * @returns {Promise<Types.SearchRes>}
 */
export function search(s, type, limit = 20, offset = 0) {
    return client.postW('/cloudsearch/get/web', {
        hlposttag: '</span>',
        hlpretag: '<span class="s-fc7">',
        limit,
        offset,
        s,
        total: true,
        type: searchTypeMap[type],
    });
}

export function subscribePlaylist(id) {
    return client.postW('/playlist/subscribe', { id });
}

export function unsubscribePlaylist(id) {
    return client.postW('/playlist/unsubscribe', { id });
}

/**
 * @param {number} limit defalut to `25`
 * @param {number} offset default to `0`
 * @returns {Promise<Types.SubscribedArtistRes>}
 */
export function getSubscribedArtists(limit = 25, offset = 0) {
    return client.postW('/artist/sublist', {
        limit,
        offset
    });
}

/**
 * @param {number} limit defalut to `25`
 * @param {number} offset default to `0`
 * @returns {Promise<Types.FavoriteVideoRes>}
 */
export function getFavoriteVideos(limit = 25, offset = 0) {
    return client.postW('/cloudvideo/allvideo/sublist', {
        limit,
        offset
    });
}

/**
 * @param {number} limit defalut to `25`
 * @param {number} offset default to `0`
 * @returns {Promise<Types.SubscribedAlbumRes>}
 */
export function getSubscribedAlumbs(limit = 25, offset = 0) {
    return client.postE('/album/sublist', {
        limit,
        offset
    });
}

/**
 * album detail, weapi
 * @param {number|string} id
 * @returns {Promise<Types.AlbumDetailWRes>}
 */
export function getAlbumDetailW(id) {
    return client.postW(`/v1/album/${id}`, {
        total: true,
        offset: 0,
        id: id,
        limit: 1000,
        ext: true,
        private_cloud: true
    });
}

/**
 * **DO NOT USE** album detail, eapi.
 * @param {number|string} id
 * @returns {Promise<Types.AlbumDetailRes>}
 */
export function getAlbumDetailE(id) {
    return client.postE('/album/v3/detail', {
        id,
        // TODO: find out what is this `cache_key`
        cache_key: crypto.randomFillSync(Buffer.alloc(32)).toString('base64')
    });
    /**
     * it seems that `cache_key` is only related to album id
     * 35864444 BA06KMtT+Jm5DZSrXsuZ0jGEx2migzblBUw9lQhLRk8=
     * 71853061 A8n1QcV7AJngH5IqI6PCRh6+VMaxh6RGw+7gM294MTA=
     */
}

/**
 * @param {number|string} id
 * @returns {Promise<Types.AlbumDynamicDetailRes>}
 */
export function getAlbumDynamicDetail(id) {
    return client.postE('/album/detail/dynamic', { id });
}

/**
 * @param {number|string} id
 * @returns {Promise<Types.AlbumPrivilegeRes>}
 */
export function getAlbumPrivilege(id) {
    return client.postE('/album/privilege', { id });
}

// utils for api `getRelatedPlaylists`
const RelatedPlaylists = {
    regexp: /<div class="cver u-cover u-cover-3">[\s\S]*?title="(.+)"\ndata-res-id="(\d+)"[\s\S]*?<img src="(.+)"[\s\S]*?<a class="nm nm f-thide s-fc3" href="(.+)" title="(.+)">/g,
    /**
     * @param {string} u
     */
    trimSrc(u) {
        const o = url.parse(u);
        return url.format({
            protocol: 'https',
            host: o.host,
            pathname: o.pathname
        });
    },
    /**
     * @param {string} u
     */
    trimId(u) {
        const o = url.parse(u);
        const { id } = qs.parse(o.query);
        return Array.isArray(id) ? id[0] : id;
    }
};

/**
 * get playlists related to given playlist
 * @param {number} id
 * @returns {Promise<Types.RelatedPlaylistsRes>}
 */
export async function getRelatedPlaylists(id) {
    try {
        const html = await client.get(`${BaseURL}/playlist?id=${id}`);
        const data = [];
        let match;
        while (match = RelatedPlaylists.regexp.exec(html)) { // eslint-disable-line no-cond-assign
            data.push({
                name: match[1],
                id: match[2],
                picUrl: RelatedPlaylists.trimSrc(match[3]),
                creator: {
                    id: RelatedPlaylists.trimId(match[4]),
                    name: match[5]
                }
            });
        }
        return { code: 200, data };
    } catch (e) {
        throw { code: 500, error: e.stack };
    }
}

const RecommendStatistics = {
    regexp: /你播放了[\s\S]*?(\d+)<\/strong>首音乐[\s\S]*?你喜欢了[\s\S]*?(\d+)<\/strong>首音乐[\s\S]*?你收藏了[\s\S]*?(\d+)<\/strong>位歌手/
};

/**
 * @returns {Promise<Types.RecommendStatisticsRes>}
 */
export async function getRecommendStatistics() {
    try {
        const html = await client.get(`${BaseURL}/discover/recommend/taste`);
        const match = RecommendStatistics.regexp.exec(html);
        return {
            code: 200,
            data: {
                playCnt: +match[1],
                likeCnt: +match[2],
                followCnt: +match[3]
            }
        };
    } catch (e) {
        throw { code: 500, error: e.stack };
    }
}

const RelatedAlbums = {
    regexp: /<div class="cver u-cover u-cover-3">\n<a href="(.+)" title="(.+)">\n<img src="(.+)">[\s\S]*?<p class="s-fc3">([\d-]+)<\/p>/g
};

/**
 * get album related to given album
 * @param {number} id
 * @returns {Promise<Types.RelatedAlbumsRes>}
 */
export async function getRelatedAlbums(id) {
    try {
        const html = await client.get(`${BaseURL}/album?id=${id}`);
        const data = [];
        let match;
        while (match = RelatedAlbums.regexp.exec(html)) { // eslint-disable-line no-cond-assign
            data.push({
                id: RelatedPlaylists.trimId(match[1]),
                name: match[2],
                picUrl: RelatedPlaylists.trimSrc(match[3]),
                publishDate: match[4]
            });
        }
        return { code: 200, data };
    } catch (e) {
        throw { code: 500, error: e.stack };
    }
}

/**
 * @param {string} id
 * @returns {Promise<Types.SubscribeAlbumRes>}
 */
export function subscribeAlbum(id) {
    return client.postE('/album/sub', { id });
}

/**
 * @param {string} id
 * @returns {Promise<Types.UnsubscribeAlbumRes>}
 */
export function unsubscribeAlbum(id) {
    return client.postE('/album/unsub', { id });
}

/**
 * 推荐 MV
 * @returns {Promise<Types.RecommendMVRes>}
 */
export function getRecommendMVs() {
    return client.postW('/personalized/mv');
}

/**
 * 推荐歌单，包含前两个固定的编辑推荐，不登录也能用
 * @param {number} limit
 * @param {number} offset
 * @returns {Promise<Types.PersonalizedPlaylistRes>}
 */
export function getPersonalizedPlaylists(limit = 10, offset = 0) {
    return client.postW('/personalized/playlist', {
        limit,
        offset,
        total: true,
        n: 1000
    });
}

/**
 * **DO NOT USE** artist detail, eapi.
 * @param {number|string} id
 * @returns {Promise<Types.ArtistDetailERes>}
 */
export function getArtistDetailE(id) {
    return client.postE('/artist/v3/detail', {
        id,
        top: '50',
        cache_key: ''
    });
}

/**
 * @param {number|string} id
 * @returns {Promise<Types.ArtistDetailWRes>}
 */
export function getArtistDetailW(id) {
    return client.postW(`/artist/${id}`);
}

/**
 * @param {number|string} id
 * @returns {Promise<Types.ArtistDynamicDetailRes>}
 */
export function getArtistDynamicDetail(id) {
    return client.postE('/artist/detail/dynamic', { id });
}

/**
 * @param {number|string} artistId
 * @returns {Promise<Types.ApiRes>}
 */
export function followArtist(artistId) {
    return client.postW('/artist/sub', {
        artistId,
        artistIds: `[${artistId}]`
    });
}

/**
 * @param {number|string} artistId
 * @returns {Promise<Types.ApiRes>}
 */
export function unfollowArtist(artistId) {
    return client.postW('/artist/unsub', {
        artistId,
        artistIds: `[${artistId}]`
    });
}

/**
 * @param {number} id
 * @param {number} offset
 * @param {number} limit
 * @returns {Promise<Types.ArtistAlbumsRes>}
 */
export function getArtistAlbums(id, offset = 0, limit = 30) {
    return client.postW(`/artist/albums/${id}`, {
        offset,
        limit,
        total: true
    });
}

/**
 * @param {number} artistId
 * @param {number} offset
 * @param {number} limit
 * @returns {Promise<Types.ArtistMVsRes>}
 */
export function getArtistMVs(artistId, offset = 0, limit = 30) {
    return client.postW('/artist/mvs', {
        artistId,
        offset,
        limit,
        total: true
    });
}

/**
 * @param {number} id
 * @returns {Promise<Types.ArtistIntroRes>}
 */
export function getArtistIntro(id) {
    return client.postW('/artist/introduction', { id });
}

/**
 * @param {number} id
 * @returns {Promise<Types.MVDetailRes>}
 */
export function getMVDetail(id) {
    return client.postW('/mv/detail', { id });
}

/**
 * @param {string} mvId
 * @returns {Promise<Types.SubscribeMVRes>}
 */
export function subscribeMV(mvId) {
    return client.postW('/mv/sub', {
        mvId,
        mvIds: `[${mvId}]`
    });
}

/**
 * @param {string} mvId
 * @returns {Promise<Types.UnsubscribeMVRes>}
 */
export function unsubscribeMV(mvId) {
    return client.postW('/mv/unsub', {
        mvId,
        mvIds: `[${mvId}]`
    });
}

/**
 * @param {number} id
 * @returns {Promise<Types.VideoDetailRes>}
 */
export function getVideoDetail(id) {
    return client.postW('/cloudvideo/v1/video/detail', { id });
}

/**
 * @param {string} id
 * @returns {Promise<Types.SubscribeVideoRes>}
 */
export function subscribeVideo(id) {
    return client.postW('/cloudvideo/video/sub', { id });
}

/**
 * @param {string} id
 * @returns {Promise<Types.UnsubscribeVideoRes>}
 */
export function unsubscribeVideo(id) {
    return client.postW('/cloudvideo/video/unsub', { id });
}

/**
 * @param {string} id
 * @returns {Promise<Types.VideoStatisticRes>}
 */
export function getVideoStatistic(id) {
    return client.postW('/cloudvideo/v1/video/statistic', { id });
}

/**
 * @param {number} id
 * @param {number} resolution
 * @returns {Promise<Types.VideoURLRes>}
 */
export function getVideoURL(id, resolution = 1080) {
    return client.postW('/cloudvideo/playurl', {
        ids: `["${id}"]`,
        resolution
    });
}

/**
 * 评论/赞/分享总数以及是否赞过
 * @param {string} threadid
 * @returns {Promise<Types.CommentThreadInfoERes>}
 */
export function getCommentThreadInfoE(threadid) {
    return client.postE('/comment/commentthread/info', {
        threadid,
        composeliked: 'true'
    });
}

/**
 * @param {string} threadId
 * @returns {Promise<Types.ApiRes>}
 */
export function likeResourceE(threadId) {
    return client.postE('/resource/like', { threadId });
}

/**
 * @param {string} threadId
 * @returns {Promise<Types.ApiRes>}
 */
export function unlikeResourceE(threadId) {
    return client.postE('/resource/unlike', { threadId });
}

/**
 * @param {string} threadId
 * @returns {Promise<Types.ApiRes>}
 */
export function likeResource(threadId) {
    return client.postW('/resource/like', { threadId });
}

/**
 * @param {string} threadId
 * @returns {Promise<Types.ApiRes>}
 */
export function unlikeResource(threadId) {
    return client.postW('/resource/unlike', { threadId });
}

/**
 * @returns {Promise<Types.RadioRes>}
 */
export function getRadio() {
    return client.postW('/v1/radio/get');
}

/**
 * @param {number} songId
 * @param {number} time
 * @returns {Promise<Types.DislikeRadioSongRes>}
 */
export function dislikeRadioSong(songId, time) {
    const query = qs.stringify({ alg: 'RT', songId, time });
    return client.postW(`/radio/trash/add?${query}`, { songId });
}

/**
 * @returns {Promise<Types.RadioRes>}
 */
export function getRadioE() {
    return client.postE('/v1/radio/get');
}

/**
 * @param {number} songId
 * @param {number} time time in ms
 * @returns {Promise<Types.SkipRadioERes>}
 */
export function skipRadioE(songId, time) {
    return client.postE('/v1/radio/skip', {
        songId,
        time,
        alg: 'itembased'
    });
}

/**
 * @param {number} trackId
 * @param {number} time time in ms
 * @param {boolean} like should like or not
 * @returns {Promise<Types.LikeRadioERes>}
 */
export function likeRadioE(trackId, time, like = true) {
    return client.postE('/v1/radio/like', {
        trackId,
        time,
        alg: 'itembased',
        like
    });
}

/**
 * @param {number} songId
 * @param {number} time time in ms
 * @returns {Promise<Types.AddRadioTrashERes>}
 */
export function addRadioTrashE(songId, time) {
    return client.postE('/v1/radio/trash/add', {
        songId,
        time,
        alg: 'alg_fm_rt_bysong'
    });
}

/**
 * @param {number} limit
 * @param {number} addTime 
 * @returns {Promise<Types.RadioTrashERes>}
 */
export function getRadioTrashE(limit, addTime) {
    return client.postE('/v2/radio/trash/get', { limit, addTime });
}

/**
 * @param {number} songId
 * @returns {Promise<Types.ApiRes>}
 */
export function removeRadioTrashE(songId) {
    return client.postE('/radio/trash/del', { songId });
}

/**
 * @param {number} trackId
 * @param {boolean} like
 * @returns {Promise<Types.LikeSongERes>}
 */
export function likeSongE(trackId, like = true) {
    return client.postE('/song/like', { trackId, like, userid: 0 });
}

/**
 * 首页推荐->最新音乐
 * @returns {Promise<Types.NewAlbumsRes>}
 */
export function getNewAlbums() {
    return client.postE('/personalized/newalbum');
}

/**
 * 首页->Banner 横幅
 * @param {"pc" | "web" | "android" | "iphone"} clientType
 * @returns {Promise<Types.BannerRes>}
 */
export function getBanners(clientType = 'pc') {
    return client.postE('/banner/get/v3', { clientType });
}

/**
 * 订阅电台
 * @param {number} id
 * @returns {Promise<Types.ApiRes>}
 */
export function subscribeDj(id) {
    return client.postE('/djradio/sub', { id });
}

/**
 * 取消订阅电台
 * @param {number} id
 * @returns {Promise<Types.ApiRes>}
 */
export function unsubscribeDj(id) {
    return client.postE('/djradio/unsub', { id });
}

/**
 * 订阅的电台列表
 * @param {number} limit
 * @param {number} time
 * @param {boolean} needFee
 * @returns {Promise<Types.SubscribedDjRes>}
 */
export function getSubscribedDj(limit = 100, time = 0, needFee = false) {
    return client.postE('/djradio/subed/v1', { limit, time, needFee });
}

/**
 * 电台详情
 * @param {number} id
 * @returns {Promise<Types.DjDetailRes>}
 */
export function getDjDetail(id) {
    return client.postE('/djradio/v2/get', { id });
}

/**
 * 电台节目列表
 * @param {number} radioId
 * @param {number} limit
 * @param {number} offset
 * @param {boolean} asc
 * @param {boolean} filterlikeplay
 * @returns {Promise<Types.DjProgramRes>}
 */
export function getDjProgram(radioId, limit = 100, offset = 0, asc = false, filterlikeplay = true) {
    return client.postE('/v1/dj/program/byradio', { radioId, limit, offset, asc, filterlikeplay });
}

/**
 * 电台节目详情
 * @param {number} id
 * @returns {Promise<Types.DjProgramDetailRes>}
 */
export function getDjProgramDetail(id) {
    return client.postE('/dj/program/detail', { id });
}

/**
 * 批量查询电台节目可用音质与文件大小
 * @param {number|number[]} idOrIds
 * @returns {Promise<Types.DjProgramMusicsRes>}
 */
export function getDjProgramMusics(idOrIds) {
    const ids = `[${idOrIds}]`;
    return client.postE('/dj/program/song/musics', { ids });
}

/**
 * 用户创建的电台
 * @param {number} userId
 * @param {number} limit
 * @param {number} offset
 * @returns {Promise<Types.DjCreatedByRes>}
 */
export function getDjCreatedBy(userId, limit = 1000, offset = 0) {
    return client.postE('/djradio/get/byuser', { userId, limit, offset });
}
