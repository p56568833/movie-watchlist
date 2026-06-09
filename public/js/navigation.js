/**
 * 导航中心 — 打破 detailPanel ↔ personDetail 循环依赖
 * init.js 初始化一次，其他模块从这里取导航函数，不需要手动注入。
 */

let _openDetail = null;
let _openPerson = null;

/** init.js 调用一次，注册两个导航入口 */
export function initNavigation({ openDetail, openPerson }) {
  _openDetail = openDetail;
  _openPerson = openPerson;
}

/** 打开电影详情 */
export function goMovie(movie) {
  _openDetail?.(movie);
}

/** 打开影人详情 */
export function goPerson(person) {
  _openPerson?.(person);
}
