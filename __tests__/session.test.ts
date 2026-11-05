/* eslint-disable no-script-url -- Invalid navigation inputs are intentional regression cases. */
import {closingTab, persistableSession, restoreTabs} from '../src/browser/session';

test('closing an ad/child tab returns to its opener, not an unrelated last tab', () => {
  const tabs = [{id:'parent',url:'https://example.test/watch',title:'Video'}, {id:'other',url:'https://other.test',title:'Other'}, {id:'child',url:'https://child.test',title:'Child',parentId:'parent'}];
  expect(closingTab(tabs,'child','child')).toEqual({tabs:tabs.slice(0,2),activeId:'parent'});
});
test('private tabs are excluded from persistence and restored sessions validate identifiers and schemes', () => {
  const tabs = [{id:'normal',url:'https://example.test',title:'Normal'}, {id:'private',url:'https://private.test',title:'Private',privateMode:true}];
  expect(persistableSession(tabs,'private')).not.toContain('private.test');
  expect(restoreTabs(persistableSession(tabs,'private'))?.activeId).toBe('normal');
  expect(restoreTabs(JSON.stringify({tabs:[{id:'../escape',url:'https://example.test'}, {id:'bad',url:'javascript:alert(1)'}]}))).toBeNull();
  expect(restoreTabs('corrupt')).toBeNull();
});
