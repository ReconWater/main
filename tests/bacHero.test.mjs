import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const from = (name) => readFileSync(new URL(`../${name}`,import.meta.url),'utf8');
test('hero specifically presents Hospira 30 mL bacteriostatic water, not peptides',()=>{
  const hero=from('src/HeroExperience.jsx');
  assert.match(hero,/Hospira/);
  assert.match(hero,/Bacteriostatic/);
  assert.match(hero,/30 mL/);
  assert.doesNotMatch(hero,/peptide|reconstitution|syringe/i);
  assert.match(hero,/role="tablist"/);
});
test('old generic hero is replaced without stacking obsolete styles',()=>{
  assert.match(from('src/App.jsx'),/import HeroExperience from '\.\/HeroExperience'/);
  assert.doesNotMatch(from('src/App.jsx'),/function HomepageHero/);
  assert.doesNotMatch(from('src/styles.css'),/\.rw-hero-stage/);
  assert.match(from('src/hero.css'),/recon-water-background-4k.webp/);
  assert.ok(existsSync(new URL('../public/recon-water-background-4k.webp',import.meta.url)));
});
