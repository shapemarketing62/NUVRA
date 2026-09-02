"use client";

import { useState } from "react";

export function ProductFilm({ src }: { src?: string }) {
  const [videoFailed, setVideoFailed] = useState(false);
  const showVideo = Boolean(src) && !videoFailed;

  return (
    <figure className="product-film">
      {showVideo ? (
        <div className="product-film-media">
          <video className="product-film-video" autoPlay muted loop playsInline preload="metadata" poster="/nuvra-product-film-poster.svg" aria-label="Demostración del flujo de análisis de NUVRA" onError={() => setVideoFailed(true)}>
            <source src={src} type="video/webm" />
          </video>
          <img className="product-film-poster" src="/nuvra-product-film-poster.svg" alt="Vista demostrativa del diagnóstico de NUVRA" />
        </div>
      ) : (
        <div className="product-film-fallback" role="img" aria-label="Demostración animada: NUVRA organiza señales, presenta un diagnóstico y propone una acción">
          <div className="film-toolbar"><span /><span /><span /><b>NUVRA · Negocio demo</b></div>
          <div className="film-sidebar"><i /><i /><i /><i /><i /></div>
          <div className="film-scene film-scene-signals">
            <span className="film-label">Señales disponibles</span>
            <div className="film-sources"><b>Sitio web</b><b>Instagram</b><b>Reseñas</b></div>
            <div className="film-signal-route"><i /><i /><i /></div>
          </div>
          <div className="film-scene film-scene-score">
            <span className="film-label">Lectura actual</span>
            <strong className="film-score">64<small>/100</small></strong>
            <div className="film-score-copy"><b>Base aprovechable</b><span>2 áreas evaluables</span></div>
          </div>
          <div className="film-scene film-scene-diagnosis">
            <span className="film-label">Prioridad</span>
            <strong>Validar qué ayuda a que más clientes vuelvan.</strong>
            <p>La evidencia todavía no demuestra una única causa.</p>
          </div>
          <div className="film-scene film-scene-action">
            <span className="film-label">Plan de acción</span>
            <strong>Medir una intervención pequeña.</strong>
            <div className="film-action-meta"><span>4 semanas</span><span>KPI definido</span><span>Bajo esfuerzo</span></div>
          </div>
          <div className="film-progress" aria-hidden="true" />
        </div>
      )}
      <figcaption>Señales → diagnóstico → prioridad → acción</figcaption>
    </figure>
  );
}
