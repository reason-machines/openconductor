async function ln4({ fetchPage: U }) {
  let B = [], G;
  while (true) {
    let D = RD5.parse(await U(G));
    if (B.push(...D.data), !D.nextCursor)
      return B;
    G = D.nextCursor;
  }
}