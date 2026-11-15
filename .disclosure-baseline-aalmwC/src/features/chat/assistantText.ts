export function assistantDisplayText(text: string, stripAbsolutelyRight: boolean): string {
  return stripAbsolutelyRight
    ? text
      .replace(/^You['']re absolutely right!\s*/i, "")
      .replace(/^You['']re absolutely right\.\s*/i, "")
      .replace(/^You['']re absolutely right -\s*/i, "")
      .replace(/^You['']re absolutely right –\s*/i, "")
      .replace(/^You['']re absolutely right\s*/i, "")
    : text;
}
