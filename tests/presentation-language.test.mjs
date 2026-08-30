import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  PRESENTATION_LIMITS,
  formatActionForBusiness,
  presentOpportunity,
  presentProblem,
} from "../lib/simple-language-presenter.ts";

const forbiddenPresentationText = /La hipótesis se apoya|se consideró evidencia|\b\d+ señales?\b|confidence|weights?|analysis_trace|commercial_journey|problem_candidates|strength_candidates|\b\d+(?:[.,]\d+)?\s*(?:ms|s|segundos?)\b|—/i;

const labProblem = {
  title: "El principal freno parece estar entre el interés y la acción: cuesta pasar desde la información disponible hasta reservar o hacer un pedido.",
  explanation: "La hipótesis se apoya en 10 señales a favor y considera 4 señales en contra. Evidencia: El formulario con 23 campos aparece antes de poder reservar una mesa o consultar por café para eventos. También se consideró evidencia favorable de Instagram. Esto importa para conseguir más visitas al local. Duración: 0,4s.",
  objective: "conseguir más visitas y pedidos para LAB Tostadores",
};

test("LAB Tostadores recibe un problema breve, específico y sin texto de auditoría", () => {
  const result = presentProblem(labProblem);
  assert.ok(result.title.length <= PRESENTATION_LIMITS.problem);
  assert.ok(result.explanation.length <= PRESENTATION_LIMITS.explanation);
  assert.ok(result.whyItMatters.length <= PRESENTATION_LIMITS.explanation);
  assert.doesNotMatch(Object.values(result).join(" "), forbiddenPresentationText);
  assert.match(`${result.title} ${result.explanation}`, /reservar|pedido|formulario/i);
  assert.match(result.whyItMatters, /LAB Tostadores/i);
  assert.equal(result.title.includes("\n"), false);
});

test("las oportunidades comerciales quedan en una frase humana y completa", () => {
  const raw = [
    "Destrabar acción comercial para que más personas puedan reservar una mesa: reducir los pasos del formulario actual.",
    "Destrabar evaluación para que más personas puedan elegir el café adecuado: explicar origen, molienda y preparación.",
    "Aprovechar esta fortaleza antes de hacer un pedido: las reseñas destacan repetidamente la atención del equipo.",
  ];
  const output = raw.map(presentOpportunity);
  assert.equal(output.length, 3);
  for (const item of output) {
    assert.ok(item.length <= PRESENTATION_LIMITS.opportunity, item);
    assert.match(item, /[.!?]$/);
    assert.doesNotMatch(item, forbiddenPresentationText);
    assert.doesNotMatch(item, /Destrabar|acción comercial|recorrido comercial/i);
  }
});

test("una acción muestra qué hacer y cómo medirlo sin exponer el razonamiento interno", () => {
  const action = formatActionForBusiness({
    id: "lab-reserva",
    title: "Acortar el pedido desde la página de visitas",
    description: "Reemplazar el formulario demasiado largo por un botón de WhatsApp con un mensaje preparado para reservar una mesa o consultar por un pedido. La intervención responde a: action_path.",
    impact: "alto",
    difficulty: "baja",
    estimatedTime: "1 semana",
    rationale: "La hipótesis se apoya en 10 señales. Facilitar este paso ayuda a conseguir más visitas para LAB Tostadores.",
    problem: labProblem.title,
    inference: "El formulario actual agrega pasos antes de reservar o hacer un pedido.",
    evidence: "El formulario con 23 campos aparece antes del contacto.",
    indicatorToImprove: "reservas y pedidos iniciados desde la página",
    done: false,
  });
  assert.ok(action.whatToDo.length <= PRESENTATION_LIMITS.action);
  assert.ok(action.expectedResult.length <= PRESENTATION_LIMITS.metric);
  assert.match(action.whatToDo, /WhatsApp|reservar|pedido/i);
  assert.match(action.expectedResult, /^Medir:/);
  assert.doesNotMatch(`${action.title} ${action.whatToDo} ${action.expectedResult}`, forbiddenPresentationText);
});

test("la presentación no altera la evidencia completa conservada por AnalysisTrace", () => {
  const fullEvidence = "El formulario tiene 23 campos, aparece antes del contacto y fue observado en https://lab.example/reservas a las 14:35:02.";
  const trace = { evidence: [{ id: "web:form:1", text: fullEvidence, confidence: 0.87 }], timings: { commercial_journey: 412 } };
  const snapshot = structuredClone(trace);
  presentProblem({ title: labProblem.title, explanation: `Evidencia: ${fullEvidence}`, objective: labProblem.objective });
  assert.deepEqual(trace, snapshot);
  assert.equal(trace.evidence[0].text, fullEvidence);
});

test("el dashboard prioriza una acción inmediata y deriva el detalle a sus vistas canónicas", () => {
  const dashboard = fs.readFileSync(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");
  const actions = fs.readFileSync(new URL("../app/dashboard/acciones/page.tsx", import.meta.url), "utf8");
  assert.match(dashboard, /actionsSummary\.immediateAction/);
  assert.match(dashboard, /Próxima acción/);
  assert.match(dashboard, /Ver diagnóstico/);
  assert.match(dashboard, /Ver todas las acciones/);
  assert.doesNotMatch(dashboard, /sourceMessages|analysisTrace|analysisAudit/);
  assert.doesNotMatch(actions, /1\. ¿Qué problema hay|2\. ¿Por qué importa|3\. ¿Qué debería hacer|4\. ¿Qué resultado/);
});
