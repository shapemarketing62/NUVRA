import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateNuvraScore } from '../services/scoring/nuvra-score.ts';
import { runStrategyEngine } from '../services/strategy/strategy-engine.ts';
import { selectStrategicFrameworks } from '../services/strategy/strategic-frameworks.ts';
import { generateClarificationQuestions } from '../services/clarification/clarification-engine.ts';

test('presence digital cannot score 100 with insufficient coverage', () => {
  const findings = [
    { type: 'problem', category: 'presencia', severity: 'medium', title: 'Navegación limitada', description: 'Navegación limitada', evidence: 'Solo 2 enlaces en nav/header.', pageUrl: 'https://example.com', source: 'html', confidence: 'alta', impact: 'medio' },
    { type: 'problem', category: 'presencia', severity: 'low', title: 'Sin estructura H2', description: 'Sin estructura H2', evidence: 'Contenido extenso sin subtítulos H2.', pageUrl: 'https://example.com', source: 'html', confidence: 'alta', impact: 'bajo' },
  ] as any;

  const result = calculateNuvraScore(findings, 1, 'Aumentar ventas', 90, false, true);
  const presencia = result.dimensions.find((d) => d.slug === 'presencia');

  assert.ok(presencia, 'debe existir la dimensión de presencia');
  assert.ok((presencia?.points ?? 100) < 100, 'presencia no puede llegar a 100 con cobertura insuficiente');
});

test('seo issues should not be classified as conversion problems in strategy', () => {
  const findings = [
    { type: 'problem', category: 'seo', severity: 'high', title: 'Sin tag title', description: 'Sin tag title', evidence: 'No se encontró elemento <title>.', pageUrl: 'https://example.com', source: 'html', confidence: 'alta', impact: 'alto' },
    { type: 'problem', category: 'conversion', severity: 'high', title: 'Sin CTAs detectables', description: 'Sin CTAs detectables', evidence: 'No se encontraron CTAs.', pageUrl: 'https://example.com', source: 'html', confidence: 'alta', impact: 'alto' },
  ] as any;

  const result = calculateNuvraScore(findings, 1, 'Aumentar ventas', 90, false, true);
  const conversion = result.dimensions.find((d) => d.slug === 'conversion');
  assert.ok(conversion, 'debe haber dimensión de conversión');
  assert.ok((conversion?.problems ?? []).some((p) => p.includes('CTA')), 'la conversión debe incluir la evidencia de CTA');
  assert.ok(!(conversion?.problems ?? []).some((p) => p.includes('tag title')), 'SEO no debe aparecer como problema de conversión');
});

test('strategy cannot recommend WhatsApp without confirmed channel relevance', () => {
  const diagnosis = {
    summary: 'Diagnóstico',
    bottleneck: { dimension: 'Conversión', title: 'Sin CTA claro', explanation: 'Falta una acción principal clara.' },
    strengths: [],
    weaknesses: [],
    opportunities: [],
    risks: [],
    priorities: [{ title: 'Hacer CTA visible', reason: 'Falta CTA', order: 1 }],
    engineType: 'deterministic',
  } as any;

  const scoreResult = calculateNuvraScore([
    { type: 'problem', category: 'conversion', severity: 'high', title: 'Sin CTAs detectables', description: 'Sin CTAs detectables', evidence: 'No se encontraron CTAs.', pageUrl: 'https://example.com', source: 'html', confidence: 'alta', impact: 'alto' },
  ] as any, 1, 'Aumentar ventas', 90, false, true);

  const strategy = runStrategyEngine(
    { nombre: 'Demo', rubro: 'Servicios', objetivo: 'Aumentar ventas', plazoDias: 90, plazoLabel: '3 meses' },
    diagnosis,
    scoreResult,
    [{ type: 'problem', category: 'conversion', severity: 'high', title: 'Sin CTAs detectables', description: 'Sin CTAs detectables', evidence: 'No se encontraron CTAs.', pageUrl: 'https://example.com', source: 'html', confidence: 'alta', impact: 'alto' } as any],
  );

  assert.ok(Promise.resolve(strategy).then((result) => {
    const titles = (result.actions ?? []).map((a: any) => a.title);
    return !titles.some((title: string) => /WhatsApp/i.test(title));
  }));
});

test('framework selection should not be empty for a clear strategic bottleneck', () => {
  const frameworks = selectStrategicFrameworks({
    objective: 'Aumentar ventas',
    plazoDias: 90,
    bottleneck: 'Conversión baja',
    diagnosisSummary: 'La dimensión más débil es Conversión.',
    availableData: { hasWebsite: true, hasInstagram: false, hasCompetitorData: false, hasBusinessInfo: true },
  });

  assert.ok(frameworks.frameworks.length > 0, 'debe haber frameworks seleccionados');
  assert.ok(frameworks.frameworks.some((item) => /CRO|Funnel|Customer journey|STP/i.test(item.title)), 'debe incluir marcos útiles para el cuello de botella');
});

test('clarification engine should ask when critical assumptions are missing', () => {
  const scoreResult = calculateNuvraScore([
    { type: 'problem', category: 'conversion', severity: 'high', title: 'Sin CTAs detectables', description: 'Sin CTAs detectables', evidence: 'No se encontraron CTAs.', pageUrl: 'https://example.com', source: 'html', confidence: 'alta', impact: 'alto' },
    { type: 'problem', category: 'propuesta', severity: 'high', title: 'Sin H1', description: 'Sin H1', evidence: 'No hay H1 claro.', pageUrl: 'https://example.com', source: 'html', confidence: 'alta', impact: 'alto' },
  ] as any, 1, 'Aumentar ventas', 90, false, true);

  const result = generateClarificationQuestions(scoreResult.dimensions, scoreResult.allFindings, { objetivo: 'Aumentar ventas', rubro: '', hasInstagram: false });
  assert.ok(result.questions.length >= 1, 'debe generarse al menos una pregunta cuando la estrategia depende de supuestos');
});
