import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PALETTES } from '../lib/celebration/appearance.js';

const stylesheet = readFileSync(new URL('../app/tokens.css', import.meta.url), 'utf8');
function colors(selector) {
  const opening = `${selector} {`;
  const at = stylesheet.indexOf(opening);
  assert.notEqual(at, -1, `Missing palette rule ${selector}`);
  const close = stylesheet.indexOf('}', at + opening.length);
  assert.notEqual(close, -1, `Unclosed palette rule ${selector}`);
  return Object.fromEntries([...stylesheet.slice(at + opening.length, close).matchAll(/--([a-z-]+):\s*([^;]+);/g)].map(match => [match[1], match[2].trim()]));
}
function luminance(hex) {
  assert.match(hex, /^#[0-9a-f]{6}$/i);
  const parts=hex.slice(1).match(/../g).map(value=>parseInt(value,16)/255).map(value=>value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4);
  return 0.2126*parts[0]+0.7152*parts[1]+0.0722*parts[2];
}
function contrast(first,second) {
  const a=luminance(first),b=luminance(second);
  return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
}

test('every shipped palette has readable text pairs in light and dark appearances',()=>{
  const pairs=[['foreground','background'],['card-foreground','card'],['primary-foreground','primary'],['secondary-foreground','secondary'],['muted-foreground','muted'],['muted-foreground','card'],['popover-foreground','popover']];
  for(const palette of PALETTES) for(const selector of [`[data-cb-palette="${palette}"]`,`html.dark[data-cb-palette="${palette}"], html.dark [data-cb-palette="${palette}"]`]) {
    const theme=colors(selector);
    for(const [ink,surface] of pairs) assert.ok(contrast(theme[ink],theme[surface])>=4.5,`${palette} ${selector}: ${ink} on ${surface}`);
  }
});
