export const find = (obj:any, source:any):any => {
  if(obj && source.length === 1) {
    return obj[source[0]];
  } else if(obj && source.length > 1) {
    return find(obj[source.shift()], source);
  }
  return undefined;
}
  
export const put = (obj:any, source:any, value:any, overwrite:boolean = false, key:any = undefined):any => {
  if(obj && source.length === 1) {
    if(Array.isArray(value)) {
      if(value.length > 0 && overwrite) {
        obj[source[0]] = value;
      } else if(value.length > 0) {
        if(key) {
          const map = new Map();
          if(obj[source[0]]) obj[source[0]].forEach((element:any) => map.set(element[key],element));
          value.forEach((element) => map.set(element[key],element));
          obj[source[0]] = [...map.values()];
        } else {
          const set = new Set(obj[source[0]] || []);
          value.forEach((element) => set.add(element));
          obj[source[0]] = [...set];
        }
      }
    } else {
      if(overwrite || !obj[source[0]]) obj[source[0]] = value;
    }
  } else if(obj && source.length > 1) {
    const key = source.shift();
    if(!obj[key]) obj[key] = {};
    put(obj[key], source, value, overwrite);
  }
}

export const merge = (source:any, destination:any, mapping:any[]) => {
  for(const map of mapping) {

    const value = find(source, map.source.split('.'));

    if(value) {
      put(destination, map.destination.split('.'), map.transform ? map.transform(value) : value, map.overwrite!, map.key!);
    }
  }
}

export const roundPrice = (price:any) => {
  let priceRound:any = Number.parseFloat(price);

  const significantDecimals = 3;

  if(priceRound > 1) {
    priceRound = priceRound.toFixed(significantDecimals);
  } else {
    const decimals = priceRound === 0 ? significantDecimals :(Math.floor(Math.log10(priceRound) + 1) * -1) + significantDecimals
    priceRound = priceRound.toFixed(decimals);
  }

  return Number.parseFloat(priceRound);
}

export const secureAddress:any = (address:any) => {
  const response = address.toLowerCase().trim().match(/0x[a-fA-F0-9]{40}/g);

  if(response) return response[0];
  
  return undefined;
}