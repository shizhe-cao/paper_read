/** B 站视频相关工具函数 */

/** 由 bvid 生成嵌入播放器地址 */
export function playerSrc(bvid) {
  if (!bvid) return '';
  if (bvid.startsWith('av:')) {
    return `https://player.bilibili.com/player.html?aid=${bvid.slice(3)}&page=1&autoplay=0&danmaku=0&high_quality=1`;
  }
  return `https://player.bilibili.com/player.html?bvid=${bvid}&page=1&autoplay=0&danmaku=0&high_quality=1`;
}

/** 由 bvid 生成 B 站视频页地址 */
export function videoPageUrl(bvid) {
  if (!bvid) return '';
  if (bvid.startsWith('av:')) return `https://www.bilibili.com/video/${bvid.slice(3)}`;
  return `https://www.bilibili.com/video/${bvid}`;
}
