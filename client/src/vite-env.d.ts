/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

// d3-org-chart type declarations
declare module 'd3-org-chart' {
  export class OrgChart<T = any> {
    constructor();
    container(el: HTMLElement): this;
    data(data: T[]): this;
    nodeWidth(fn: (d: any) => number): this;
    nodeHeight(fn: (d: any) => number): this;
    childrenMargin(fn: (d: any) => number): this;
    compactMarginBetween(fn: (d: any) => number): this;
    siblingsMargin(fn: (d: any) => number): this;
    neighbourMargin(fn: (d: any) => number): this;
    nodeButtonWidth(fn: (d: any) => number): this;
    nodeButtonHeight(fn: (d: any) => number): this;
    nodeContent(fn: (d: any, i: number, arr: any[], state: any) => string): this;
    buttonContent(fn: (params: { node: any; state: any }) => string): this;
    compact(value: boolean): this;
    initialZoom(value: number): this;
    setActiveNodeCentered(value: boolean): this;
    onNodeClick(fn: (d: any) => void): this;
    render(): this;
    clear(): this;
    fit(): this;
    expandAll(): this;
    collapseAll(): this;
    zoomBehavior(): any;
    getSvgSelection(): any;
    exportImg(options?: { full?: boolean; scale?: number; onLoad?: () => void }): void;
    exportSvg(options?: { full?: boolean; onLoad?: () => void }): void;
  }
}
