/**
 * docSort.ts
 * 웹페이지 전역 정렬 규칙을 Single Source of Truth 원칙에 따라 분리하였다.
 * 컴포넌트 ContentList, CategoryIndex와 content.data.ts(Node build) 양쪽에서 import.
 * Vue와 브라우저의 API 의존성을 제거한 순수 module로 작성.
 * 
 * 참고: https://www.typescriptlang.org/docs/handbook/typescript-in-5-minutes.html
 */ 
 
 //content.data.ts와 SortableDoc 사이의 순환 의존을 방지하기 위해 DocItem으로부터 정렬에 필요한 필드만 요구한다.
export interface SortableDoc {
    date: string
    series?: string | null
    seriesOrder?: number | null
    order?: number | string | null
}

const ts = (s?: string) => { const v = s ? +new Date(s) : NaN; return Number.isNaN(v) ? 0 : v};

/** '최근' 정렬: 최신 Date 내림차순 + 같은 날짜면 seriesOrder 내림차순 + 같은 series면 파일 order 내림차순 */
//로직
export function compareRecent(a: SortableDoc, b: SortableDoc): number {
    return (ts(b.date) - ts(a.date))
        || ((b.seriesOrder ?? -1) - (a.seriesOrder ?? -1))
        || ((Number(b.order) || 0) - (Number(a.order) || 0));
}

//수행
export function sortRecent<T extends SortableDoc> (list:readonly T[]): T[] {
    return [...list].sort(compareRecent);
}

/** '목차' 정렬: series CLUSTER(※) + seriesOrder 오름차순 + 같은 series면 order 오름차순 + 같은 order면 date 오름차순
 * ※ series CLUSTER: 목차 정렬 시, 같은 series끼리 문서의 리스트 항목을 붙여서 정렬시킨다. 각 시리즈끼리는 시작일 오름차순 + 동일 날짜 시작한 시리즈는 이름 오름차순 */
export function sortToc<T extends SortableDoc> (list:readonly T[]): T[] {
    const arr = [...list];
    const NO_SERIES = '\uffff'; //series가 없는 낱개 문서는 series CLUSTER의 최하단으로 보낸다.
    const key = (d: SortableDoc) => d.series || NO_SERIES;

    const seriesStart = new Map<string, number>();
    for(const d of arr) {
        const s = key(d);
        const v = d.date ? +new Date(d.date) : Infinity;
        if(!seriesStart.has(s) || v < seriesStart.get(s)!)  seriesStart.set(s, v);
    }
    const rank = (s: string) => (s === NO_SERIES ? Infinity : seriesStart.get(s) ?? Infinity);

    return arr.sort((a,b) => {
        const sa = key(a);
        const sb = key(b);
        if(sa !== sb) return rank(sa) - rank(sb) || sa.localeCompare(sb, 'ko');
        return (a.seriesOrder ?? 9999) - (b.seriesOrder ?? 9999)
            || (Number(a.order) || 9999) - (Number(b.order) || 9999)
            || (+new Date(a.date) - +new Date(b.date));
    });
}

// 01. +new 문법은 뭐야?
// 02. sortToc 내부의 for문에서 `if(!seriesStart.has(s) || v < seriesStart.get(s)!)  seriesStart.set(s, v);`, if 조건절의 앞뒤 느낌표는 뭐야?
// 03. date 누락 시 NaN으로 처리되는 걸 방지하는 방법이, '최근' 정렬에서는 0 취급인 건 알겠어. '목차'에서는 Infinity 취급을 한 거 맞아? 오름차순 vs 내림차순의 차이인가?
// 04. 구조적 타이핑의 구현으로, '유틸이 로더의 타입을 import하고 로더가 다시 유틸을...' 설명이 부족해. 유틸은 docSort의 함수들을 말하는 거지? 로드는 뭘 말하는 거야? Vitepress의 빌드 산출물을 가리켜, 아니면 배포 과정에서 문서를 "로딩"할 때 실행되는 코드를 의미해? content.data.ts 파일을 말하는 거야?
// 05. 각 블록 별 코드 리뷰(설명)을 해줄래? 주석을 비즈니스 로직 흐름을 따라서, 적당히 몇 줄씩 묶어 설명해줘.
