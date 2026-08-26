import type { Metadata } from "next";
import { LogoConceptFrameC1 } from "@/components/brand/logo-concepts";
import styles from "./preview.module.css";

export const metadata: Metadata = { title: "NUVRA — Sistema visual definitivo", robots: { index: false, follow: false } };

const palette = [
  ["Background", "#F7F5F0"], ["Surface", "#FFFFFF"], ["Surface muted", "#F0EDE6"],
  ["Brand", "#3D52B8"], ["Brand dark", "#26367F"], ["Brand soft", "#E9EDFF"],
  ["Terracota", "#C46B50"], ["Terracota soft", "#F4E4DE"], ["Salvia", "#5F7866"],
  ["Salvia soft", "#E6EEE8"], ["Arena", "#D8BD91"], ["Arena soft", "#F3EBDD"],
];

export default function DesignPreviewPage() {
  return <main className={styles.preview}><div className={styles.container}>
    <header className={styles.header}><div className={styles.eyebrow}>Vista interna · identidad definitiva</div><h1>NUVRA, sistema visual</h1><p>C1 — Marco enlazado y la nueva paleta aplicada a los elementos principales del producto.</p></header>

    <section className={styles.brandStage}>
      <div className={styles.brandLight}><LogoConceptFrameC1 style={{width:"100%",maxWidth:410}}/></div>
      <div className={styles.brandDark}><LogoConceptFrameC1 tone="light" style={{width:"100%",maxWidth:410}}/></div>
      <div className={styles.brandVariants}>
        <div><span>Compacta</span><LogoConceptFrameC1 lockup="compact" showByShape={false} tone="indigo" style={{width:190}}/></div>
        <div><span>Monocromática</span><LogoConceptFrameC1 lockup="compact" showByShape={false} accent={false} style={{width:190}}/></div>
        <div><span>Símbolo</span><LogoConceptFrameC1 lockup="symbol" accent={false} style={{width:44,height:52}}/></div>
        <div className={styles.iconBox}><LogoConceptFrameC1 lockup="favicon" tone="indigo" style={{width:32,height:32}}/></div>
      </div>
    </section>

    <section className={styles.section}><div className={styles.sectionHeading}><span>Paleta</span><h2>Color con una función clara</h2><p>Neutrales limpios, índigo para dirección, terracota para conclusiones, salvia para fortalezas y arena para ritmo.</p></div><div className={styles.palette}>{palette.map(([name,color])=><div key={name}><i style={{background:color}}/><strong>{name}</strong><span>{color}</span></div>)}</div></section>

    <section className={styles.section}><div className={styles.sectionHeading}><span>Componentes</span><h2>Controles y estados</h2></div><div className={styles.componentGrid}>
      <div className={styles.controlPanel}><div className={styles.controlRow}><button className="btn btn-primary btn-md">Acción principal</button><button className="btn btn-ghost btn-md">Secundaria</button><button className="btn btn-subtle btn-md">Acción sutil</button></div><label className="field-label" htmlFor="preview-input">Nombre del negocio</label><input id="preview-input" className="input" defaultValue="Estudio Norte" readOnly/><div className={styles.selectionRow}><button className="choice choice-active">Seleccionado</button><button className="choice">Alternativa</button></div></div>
      <div className={styles.sidebarPreview}><LogoConceptFrameC1 style={{width:142}}/><span>Trabajo</span><strong>Resumen</strong><span>Diagnóstico</span><span>Mi estrategia</span><span>Acciones</span><div className={styles.account}>Estudio Norte<small>Plan Pro</small></div></div>
    </div></section>

    <section className={styles.section}><div className={styles.sectionHeading}><span>Producto</span><h2>Diagnóstico y acción</h2></div><div className={styles.productGrid}>
      <div className={styles.scorePanel}><div className={styles.score}><span>67</span><small>/100</small></div><div><strong>Nuvra Score</strong><p>Una lectura del estado comercial actual.</p></div></div>
      <div className={styles.conclusion}><span style={{color:"var(--n-danger)"}}>Lo más importante</span><h3>El interés existe, pero el paso hacia la consulta todavía puede ser más directo.</h3><p>La conclusión usa terracota para ganar jerarquía sin parecer una alerta.</p></div>
      <div className={styles.opportunity}><span style={{color:"var(--n-warning)"}}>Oportunidad</span><h3>Usar la confianza existente para facilitar la decisión.</h3><p>Las reseñas positivas pueden acercarse al momento de contacto.</p></div>
      <div className={styles.strength}><span style={{color:"var(--n-success)"}}>Fortaleza</span><h3>La atención aparece como un motivo de elección.</h3><p>Esta señal puede convertirse en una ventaja más visible.</p></div>
    </div><div className={styles.action}><i/><div><span>Prioridad 1</span><h3>Simplificar el próximo paso</h3><p>Acercar el contacto al momento en que la persona termina de evaluar el negocio.</p><small>Métrica · consultas iniciadas desde la página principal</small></div><button className="btn btn-primary btn-sm">Marcar lista</button></div></section>
  </div></main>;
}
