/**
 * taxonomyImpacts.js — Impactos operacionales por taxonomía detallada.
 *
 * Cada taxonomía (ej. "banco", "farmacia", "cine") tiene impactos
 * específicos para cada señal climática, reemplazando los 5 sectores
 * genéricos del catálogo anterior.
 *
 * Orden de resolución en Layer3:
 *   1. taxonomia_operativa (de businessProfiles.js)
 *   2. sector_actual (fallback)
 *   3. "otros" (fallback final)
 */

const IMPACTS_BY_TAXONOMY = {

  // ─── Financiero ──────────────────────────────────────────────────────────

  banco: {
    extreme_heat: [
      '↑ consumo energético HVAC en oficinas y data center',
      'Riesgo de sobrecalentamiento en equipos de cómputo',
      'Reducción de afluencia en agencias presenciales',
      'Presión sobre generadores eléctricos de respaldo',
    ],
    severe_heat: [
      'Posible cierre de agencias por normativa laboral',
      'Riesgo crítico de falla en sistemas de refrigeración de data center',
      '↑ demanda de servicios digitales por migración de clientes',
    ],
    moderate_heat: [
      '↑ consumo energético moderado en climatización',
      'Reducción parcial de afluencia en horas de calor',
    ],
    drought: [
      'Restricción hídrica en edificios corporativos',
      'Riesgo operativo en zonas con racionamiento de agua',
      'Presión sobre sistemas de climatización por enfriamiento evaporativo',
    ],
    extreme_rain: [
      'Inundación de agencias en primer piso y sótanos',
      'Interrupción de accesos a sucursales',
      'Daño a cajeros automáticos en vía pública',
      'Riesgo de filtración en data center y salas de servidores',
    ],
    extreme_rain_frequency: [
      '↑ frecuencia de días con lluvia intensa afectando operaciones presenciales',
      'Riesgo de saturación de sistemas de drenaje en sucursales',
    ],
    temp_increase: [
      '↑ costos energéticos estructurales por climatización continua',
      'Necesidad de mejorar capacidad HVAC en agendas',
      'Cambio en patrones de uso de canales digitales vs presenciales',
    ],
    flood_risk: [
      'Interrupción crítica de operaciones en zonas inundables',
      'Daño a bóvedas y sistemas de seguridad',
      'Riesgo de pérdida de continuidad de negocio en sucursales expuestas',
      'Necesidad de激活ar planes de contingencia en distritos de riesgo',
    ],
    landslide_risk: [
      'Riesgo estructural en agencias ubicadas en zonas de ladera',
      'Bloqueo de accesos para personal y clientes',
      'Posible reubicación temporal de sucursales afectadas',
    ],
    huayco_risk: [
      'Bloqueo prolongado de accesos a agencias por lodo y rocas',
      'Daño estructural a infraestructura bancaria en zonas de quebrada',
      'Interrupción de servicios financieros en comunidades afectadas',
    ],
    tropical_nights: [
      '↓ productividad del personal por calidad de sueño reducida',
      '↑ carga HVAC nocturna y costos energéticos',
      'Riesgo de sobrecalentamiento en equipos que operan 24/7',
    ],
  },

  banco_inversiones: {
    extreme_heat: [
      '↑ consumo energético en oficinas corporativas',
      'Riesgo de interrupción en plataformas de trading',
      'Presión sobre sistemas de climatización de sala de servidores',
    ],
    severe_heat: [
      'Riesgo de falla en equipos de comunicaciones financieras',
      'Posible trabajo remoto obligatorio del equipo',
    ],
    moderate_heat: [
      '↑ consumo energético en oficinas',
      'Posible reducción de horario presencial',
    ],
    drought: [
      'Restricción hídrica en edificio corporativo',
      'Sin impacto directo en operaciones de inversión',
    ],
    extreme_rain: [
      'Inundación de sótanos y estacionamientos del edificio corporativo',
      'Interrupción de accesos para personal clave',
    ],
    extreme_rain_frequency: [
      '↑ frecuencia de lluvia afectando accesos a oficinas',
    ],
    flood_risk: [
      'Riesgo de inundación en distrito financiero',
      'Daño potencial a data center y sistemas de trading',
      'Interrupción de operaciones de mercado',
    ],
    tropical_nights: [
      '↓ rendimiento del equipo de inversiones por mala calidad de sueño',
    ],
  },

  procesadora_pagos: {
    extreme_heat: [
      'Riesgo de sobrecalentamiento en servidores de procesamiento',
      '↑ consumo energético en data center',
      'Posible degradación de throughput transaccional',
    ],
    severe_heat: [
      'Riesgo crítico de falla en sistemas de refrigeración del data center',
      'Posible interrupción de servicio de pagos electrónicos',
    ],
    moderate_heat: [
      '↑ consumo energético en data center',
      'Posible degradación parcial de throughput',
    ],
    drought: [
      'Sin impacto directo en procesamiento de pagos',
      'Riesgo menor por restricciones hídricas en edificio corporativo',
    ],
    extreme_rain: [
      'Inundación de data center o sala de servidores',
      'Interrupción de red de POS por daño a telecomunicaciones',
      'Riesgo de caída de pasarela de pagos',
    ],
    flood_risk: [
      'Riesgo crítico de inundación en data center',
      'Interrupción de procesamiento de transacciones',
      'Pérdida de continuidad de servicio para comercios afiliados',
      'Daño a infraestructura de red y telecomunicaciones',
    ],
    tropical_nights: [
      '↑ consumo energético nocturno en data center',
    ],
  },

  seguros: {
    extreme_heat: [
      '↑ siniestralidad por golpes de calor y deshidratación',
      '↑ demanda de atención en seguros de salud',
      'Riesgo operativo en oficinas de atención al cliente',
    ],
    severe_heat: [
      'Incremento significativo de reclamos de seguros de vida y salud',
      'Posible activación de cláusulas de fuerza mayor en pólizas',
    ],
    moderate_heat: [
      '↑ reclamos menores por gastos médicos por calor',
      '↑ consultas en seguros de salud ambulatorios',
    ],
    drought: [
      '↑ reclamos de seguros agrícolas',
      'Riesgo en seguros de cosechas y coberturas hídricas',
    ],
    extreme_rain: [
      '↑ reclamos de seguros vehiculares por inundación',
      '↑ reclamos de seguros de propiedad e infraestructura',
      'Inundación de oficinas de atención',
    ],
    flood_risk: [
      '↑ masivo de reclamos de seguros patrimoniales',
      'Presión sobre capacidad de ajuste de siniestros',
      'Riesgo de concentración de exposición en zonas inundables',
      'Posible activación de reaseguro catastrófico',
    ],
    landslide_risk: [
      '↑ reclamos de seguros de vivienda en zonas de ladera',
      'Riesgo de exposición concentrada en distritos de pendiente',
    ],
    huayco_risk: [
      '↑ reclamos catastróficos por flujo de detritos',
      'Presión sobre capacidad financiera por siniestros masivos',
    ],
  },

  financiera: {
    extreme_heat: [
      '↓ afluencia en módulos de atención presencial',
      '↑ uso de canales digitales',
      'Riesgo de sobrecalentamiento en equipos de cómputo',
    ],
    extreme_rain: [
      'Inundación de módulos de atención en primer piso',
      'Interrupción de operaciones de cobranza presencial',
      'Daño a mobiliario y equipos en módulos',
    ],
    flood_risk: [
      'Daño a módulos de atención en centros comerciales inundables',
      'Interrupción de servicios financieros presenciales',
    ],
  },

  // ─── Retail ──────────────────────────────────────────────────────────────

  supermercado: {
    extreme_heat: [
      '↑ consumo energético en refrigeración de frescos y congelados',
      'Riesgo de ruptura de cadena de frío en alimentos perecibles',
      'Confort del cliente reducido en sala de ventas',
      'Presión sobre sistemas HVAC',
    ],
    severe_heat: [
      'Riesgo crítico de pérdida de productos perecibles',
      'Posible cierre temporal por normativa sanitaria',
      '↑ costos energéticos extremos por refrigeración forzada',
    ],
    drought: [
      'Presión hídrica en operaciones de limpieza y preparación',
      'Riesgo de desabastecimiento de productos agrícolas',
      '↑ costos de insumos alimentarios por menor oferta',
      'Restricción de riego en áreas verdes',
    ],
    extreme_rain: [
      'Inundación de almacenes y sala de ventas en primer piso',
      'Interrupción de cadena logística y recepción de mercadería',
      'Daño a inventario de productos no perecibles por humedad',
      'Daños estructurales en techumbres y fachadas',
    ],
    temp_increase: [
      '↑ costos energéticos sostenidos en refrigeración y climatización',
      'Cambio estacional en patrones de consumo',
      'Necesidad de inversión en sistemas de frío más eficientes',
    ],
    flood_risk: [
      'Interrupción operativa total por inundación de local',
      'Pérdida total de inventario en almacenes y cámaras',
      'Daño a equipos de refrigeración y sistemas eléctricos',
      'Riesgo de cierre prolongado por rehabilitación',
    ],
    landslide_risk: [
      'Riesgo estructural en tiendas ubicadas en zonas de ladera',
      'Bloqueo de accesos de clientes y proveedores',
      'Posible cierre temporal por inestabilidad del terreno',
    ],
    huayco_risk: [
      'Pérdida de inventario por ingreso de lodo en tiendas y almacenes',
      'Interrupción prolongada de operaciones por limpieza y rehabilitación',
      'Bloqueo severo de rutas logísticas de abastecimiento',
    ],
    tropical_nights: [
      '↑ carga HVAC nocturna en refrigeración y climatización',
      'Riesgo en cadena de frío durante horario nocturno',
      '↓ confort del personal de turno noche',
    ],
  },

  farmacia: {
    extreme_heat: [
      'Riesgo crítico en cadena de frío de medicamentos y vacunas',
      '↑ demanda de medicamentos por golpes de calor y deshidratación',
      'Presión sobre sistemas de refrigeración farmacéutica',
      'Riesgo de degradación de principios activos termosensibles',
    ],
    severe_heat: [
      'Riesgo crítico de pérdida de vacunas y biológicos',
      '↑ demanda de urgencia de sueros y medicamentos para golpe de calor',
      'Posible cierre temporal por normativa de conservación',
    ],
    drought: [
      'Restricción hídrica en operaciones de limpieza',
      'Riesgo de desabastecimiento de agua para preparación de medicamentos',
    ],
    extreme_rain: [
      'Inundación de locales en zonas de riesgo',
      'Daño a inventario de medicamentos por humedad',
      'Interrupción de cadena logística de distribución',
      'Riesgo de contaminación de productos farmacéuticos',
    ],
    flood_risk: [
      'Pérdida total de inventario de medicamentos controlados',
      'Daño a sistemas de refrigeración farmacéutica',
      'Interrupción crítica de suministro de medicamentos en zona afectada',
      'Riesgo de contaminación por aguas servidas',
    ],
    landslide_risk: [
      'Riesgo estructural en farmacias ubicadas en zonas de ladera',
      'Interrupción de acceso para pacientes y proveedores',
    ],
    huayco_risk: [
      'Pérdida de inventario farmacéutico por ingreso de lodo',
      'Bloqueo de distribución de medicamentos a zonas afectadas',
    ],
    tropical_nights: [
      'Riesgo en cadena de frío nocturna de medicamentos',
      '↑ demanda nocturna de servicios farmacéuticos de urgencia',
    ],
  },

  tienda_departamentos: {
    extreme_heat: [
      '↓ afluencia de clientes en horas de calor extremo',
      '↑ consumo energético en climatización',
      'Riesgo en confort de experiencia de compra',
      'Presión sobre sistemas HVAC en pisos superiores',
    ],
    severe_heat: [
      'Cierre parcial de tiendas por normativa laboral',
      '↑ costos energéticos extremos',
    ],
    drought: [
      'Restricción hídrica en operaciones de limpieza y mantenimiento',
    ],
    extreme_rain: [
      'Inundación de tiendas en primer piso y sótanos',
      'Daño a inventario de textil y calzado por humedad',
      '↓ afluencia de clientes por lluvia intensa',
      'Interrupción de cadena logística de importación',
    ],
    flood_risk: [
      'Daño a inventario en almacenes subterráneos',
      'Pérdida de mercadería importada de alto valor',
      'Interrupción operativa prolongada en centros comerciales',
    ],
    tropical_nights: [
      '↑ carga HVAC nocturna',
      '↓ productividad del personal',
    ],
  },

  centro_comercial: {
    extreme_heat: [
      '↑ consumo energético en áreas comunes climatizadas',
      '↓ afluencia en horas de calor extremo',
      'Presión sobre HVAC general del centro comercial',
      'Riesgo de confort reducido en patios de comida',
    ],
    severe_heat: [
      'Posible cierre de áreas comunes por normativa',
      '↑ costos energéticos extremos',
    ],
    drought: [
      'Restricción hídrica en áreas verdes y fuentes ornamentales',
      'Riesgo en operaciones de limpieza de áreas comunes',
    ],
    extreme_rain: [
      'Inundación de estacionamientos subterráneos',
      'Filtraciones en techumbres de áreas comunes',
      '↓ afluencia general',
      'Daño a locales comerciales arrendados',
    ],
    flood_risk: [
      'Inundación de sótanos y estacionamientos',
      'Daño a subestación eléctrica y equipos en sótano',
      'Interrupción total de operaciones del centro comercial',
      'Riesgo de cierre prolongado',
    ],
    landslide_risk: [
      'Riesgo estructural en centros comerciales en zonas de ladera',
      'Daño a infraestructura de accesos',
    ],
    huayco_risk: [
      'Daño catastrófico a infraestructura en zonas de quebrada',
      'Interrupción prolongada de operaciones por limpieza',
    ],
    tropical_nights: [
      '↑ carga HVAC nocturna en áreas comunes',
      'Posible extensión de horario nocturno por clima',
    ],
  },

  homecenter: {
    extreme_heat: [
      '↑ consumo energético en climatización de tienda almacén',
      'Riesgo en confort de clientes en patio de materiales',
      'Presión sobre ventilación en áreas de almacenamiento',
    ],
    severe_heat: [
      'Posible cierre de patio de materiales por normativa',
      'Riesgo de seguridad para personal en exteriores',
    ],
    drought: [
      '↑ demanda de productos para cosecha de agua y sistemas de riego',
      'Restricción hídrica en operaciones de mezcla de materiales',
    ],
    extreme_rain: [
      'Inundación de almacenes y patio de materiales',
      'Daño a inventario de materiales de construcción a la intemperie',
      'Interrupción de recepción de mercadería',
      'Daño a maderas y planchas almacenadas',
    ],
    flood_risk: [
      'Pérdida de inventario de materiales en almacenes',
      'Daño a maquinaria y equipos de patio',
      'Interrupción logística de distribución',
    ],
    landslide_risk: [
      'Riesgo de daño a instalaciones en zonas de acopio de materiales',
    ],
  },

  // ─── Educación ───────────────────────────────────────────────────────────

  colegio: {
    extreme_heat: [
      'Cancelación de clases por calor extremo en aulas',
      'Riesgo de salud para estudiantes y docentes',
      '↑ demanda de hidratación y sombra en recreos',
      'Presión sobre ventilación en aulas sin climatización',
    ],
    severe_heat: [
      'Suspensión obligatoria de clases',
      'Riesgo crítico de golpe de calor en menores',
    ],
    drought: [
      'Restricción de uso de agua en servicios sanitarios',
      'Impacto en limpieza e higiene escolar',
      'Riesgo de cierre por falta de agua potable',
    ],
    extreme_rain: [
      'Daño a infraestructura educativa (techos, aulas)',
      'Suspensión de clases presenciales',
      'Riesgo de inundación en primeros pisos',
      'Interrupción de accesos para estudiantes',
    ],
    flood_risk: [
      'Daño estructural severo a instalaciones educativas',
      'Suspensión prolongada de clases',
      'Interrupción del calendario académico',
    ],
    landslide_risk: [
      'Riesgo estructural en colegios construidos en laderas',
      'Posible reubicación temporal de estudiantes',
    ],
    huayco_risk: [
      'Daño severo a infraestructura educativa por flujo de detritos',
      'Suspensión prolongada del servicio educativo',
    ],
    tropical_nights: [
      '↓ rendimiento académico por mala calidad de sueño',
      '↑ costos de climatización nocturna en residencias estudiantiles',
    ],
  },

  universidad: {
    extreme_heat: [
      'Cancelación de clases presenciales en horas pico de calor',
      'Riesgo de salud para estudiantes y personal',
      'Presión sobre sistemas HVAC en campus',
      '↑ uso de plataformas virtuales como alternativa',
    ],
    severe_heat: [
      'Suspensión de actividades académicas presenciales',
      'Migración forzada a educación virtual',
    ],
    drought: [
      'Restricción hídrica en campus y laboratorios',
      'Impacto en mantenimiento de áreas verdes',
      'Riesgo en operaciones de laboratorios que requieren agua',
    ],
    extreme_rain: [
      'Inundación de campus y aulas',
      'Daño a laboratorios y equipos de investigación',
      'Suspensión de clases presenciales',
      'Interrupción de transporte público para estudiantes',
    ],
    flood_risk: [
      'Daño a infraestructura universitaria y laboratorios',
      'Interrupción del semestre académico',
      'Daño a bibliotecas y archivos',
    ],
    landslide_risk: [
      'Riesgo estructural en campus ubicados en zonas de ladera',
      'Bloqueo de accesos para comunidad universitaria',
    ],
    huayco_risk: [
      'Daño severo a campus por flujo de detritos',
      'Suspensión prolongada del semestre',
    ],
    tropical_nights: [
      '↓ calidad de sueño y rendimiento académico en estudiantes',
    ],
  },

  instituto: {
    extreme_heat: [
      'Cancelación de clases presenciales por calor',
      'Riesgo de salud en talleres y laboratorios sin climatización',
      'Presión sobre ventilación en aulas técnicas',
    ],
    severe_heat: [
      'Suspensión de clases técnicas y talleres presenciales',
    ],
    drought: [
      'Restricción hídrica en talleres que requieren agua',
      'Impacto en mantenimiento de instalaciones',
    ],
    extreme_rain: [
      'Daño a aulas y talleres por filtraciones',
      'Suspensión de clases presenciales',
      'Inundación de primeros pisos en zonas de riesgo',
    ],
    flood_risk: [
      'Daño estructural a instalaciones educativas',
      'Pérdida de equipos de laboratorio y talleres',
    ],
  },

  // ─── Entretenimiento y Hospitalidad ──────────────────────────────────────

  cine: {
    extreme_heat: [
      '↑ consumo energético en climatización de salas',
      'Riesgo de confort reducido en salas con alta ocupación',
      'Posible cancelación de funciones matinales',
    ],
    severe_heat: [
      'Cancelación de funciones por normativa',
      '↑ costos energéticos extremos',
    ],
    drought: [
      'Restricción hídrica en servicios sanitarios y dulcería',
    ],
    extreme_rain: [
      '↓ afluencia significativa por lluvia',
      'Filtraciones en salas de proyección',
      'Inundación de estacionamientos subterráneos',
      'Riesgo de cancelación de funciones',
    ],
    flood_risk: [
      'Daño a salas de proyección y equipos en sótanos',
      'Interrupción prolongada de operaciones',
      'Pérdida de equipamiento audiovisual de alto valor',
    ],
    landslide_risk: [
      'Riesgo estructural en cines en zonas de ladera',
    ],
    tropical_nights: [
      'Posible extensión de horarios por demanda nocturna',
      '↑ carga HVAC en salas durante función nocturna',
    ],
  },

  restaurante: {
    extreme_heat: [
      'Riesgo en cadena de frío de insumos alimenticios',
      '↑ consumo energético en cocinas y refrigeración',
      '↓ afluencia en horas de calor extremo',
      'Presión sobre ventilación en cocinas',
    ],
    severe_heat: [
      'Posible cierre temporal de cocinas por normativa',
      'Riesgo crítico de pérdida de insumos perecibles',
    ],
    drought: [
      'Presión hídrica en preparación de alimentos y limpieza',
      'Riesgo de desabastecimiento de insumos agrícolas',
      '↑ costos de insumos alimentarios',
    ],
    extreme_rain: [
      'Inundación de locales en primeros pisos',
      'Interrupción de cadena logística de insumos',
      '↓ afluencia por lluvia intensa',
      'Daño a equipos de cocina',
    ],
    flood_risk: [
      'Pérdida total de insumos y equipos de cocina',
      'Interrupción operativa prolongada',
      'Riesgo de contaminación de alimentos',
    ],
    landslide_risk: [
      'Riesgo estructural en restaurantes en zonas de ladera',
    ],
    huayco_risk: [
      'Daño severo a local y equipos por ingreso de lodo',
      'Pérdida total de inventario de alimentos',
      'Interrupción prolongada por limpieza y rehabilitación',
    ],
    tropical_nights: [
      '↑ demanda en horario nocturno',
      'Riesgo en cadena de frío nocturna',
    ],
  },

  hotel: {
    extreme_heat: [
      '↑ consumo energético en climatización de habitaciones',
      'Riesgo de confort reducido para huéspedes',
      'Presión sobre sistemas HVAC en áreas comunes',
      '↑ demanda de hidratación y piscinas',
    ],
    severe_heat: [
      'Posible cancelación de reservas por ola de calor',
      '↑ costos energéticos extremos',
    ],
    drought: [
      'Restricción hídrica severa en habitaciones y áreas comunes',
      'Riesgo de cierre de piscinas y áreas verdes',
      'Impacto en reputación por racionamiento de agua',
    ],
    extreme_rain: [
      'Inundación de habitaciones en primer piso y sótanos',
      'Filtraciones en techumbres',
      '↓ cancelación de reservas',
      'Interrupción de accesos para huéspedes',
    ],
    flood_risk: [
      'Daño estructural a habitaciones y áreas comunes',
      'Interrupción total de operaciones hoteleras',
      'Pérdida de reservas por cierre temporal',
    ],
    landslide_risk: [
      'Riesgo estructural en hoteles en zonas de ladera o montaña',
      'Bloqueo de accesos turísticos',
    ],
    huayco_risk: [
      'Daño severo a infraestructura hotelera',
      'Interrupción prolongada de operaciones turísticas',
    ],
    tropical_nights: [
      '↓ calidad de sueño de huéspedes',
      '↑ carga HVAC nocturna',
    ],
  },

  juegos_azar: {
    extreme_heat: [
      '↑ consumo energético en climatización de locales',
      'Riesgo de sobrecalentamiento en servidores transaccionales',
      '↓ afluencia en puntos de venta presenciales',
    ],
    severe_heat: [
      'Posible cierre de puntos de venta',
    ],
    extreme_rain: [
      'Inundación de puntos de venta',
      'Interrupción de red de venta presencial',
      'Daño a terminales de venta y módulos de atención',
    ],
    flood_risk: [
      'Daño a servidores y equipos transaccionales',
      'Interrupción de plataforma de apuestas',
      'Pérdida de continuidad de servicio de venta',
    ],
  },

  // ─── Salud ───────────────────────────────────────────────────────────────

  hospital: {
    extreme_heat: [
      'Presión crítica sobre cadena de frío de medicamentos y vacunas',
      '↑ demanda de atenciones de urgencia por golpes de calor',
      'Riesgo para pacientes vulnerables (adultos mayores, niños)',
      'Presión sobre sistemas HVAC en áreas críticas',
    ],
    severe_heat: [
      'Colapso potencial de cadena de frío crítica',
      'Incremento de mortalidad en pacientes de riesgo',
      '↑ demanda masiva de atenciones de emergencia',
      'Posible saturación de servicios de urgencia',
    ],
    drought: [
      'Riesgo crítico en esterilización y limpieza clínica',
      'Presión sobre suministro de agua potable para pacientes',
      'Riesgo en operaciones de diálisis y laboratorios',
    ],
    extreme_rain: [
      'Interrupción de acceso de ambulancias y pacientes',
      'Daño a equipos médicos por humedad e inundación',
      'Riesgo de contaminación nosocomial por aguas servidas',
      'Inundación de sótanos con equipos críticos',
    ],
    flood_risk: [
      'Interrupción crítica de servicios de salud',
      'Daño a equipos médicos de alto valor',
      'Riesgo de colapso del servicio de emergencia',
      'Necesidad de evacuación de pacientes críticos',
    ],
    landslide_risk: [
      'Acceso a centro de salud comprometido por bloqueo de vías',
      'Daño a infraestructura crítica de salud',
    ],
    huayco_risk: [
      'Acceso a centro de salud bloqueado por lodo y rocas',
      'Daño a infraestructura crítica por impacto de detritos',
      'Interrupción de servicios esenciales',
    ],
    tropical_nights: [
      'Riesgo para pacientes hospitalizados durante la noche',
      '↑ demanda de urgencias por estrés térmico nocturno',
      '↑ carga HVAC en áreas de hospitalización',
    ],
  },

  // ─── Industrial ──────────────────────────────────────────────────────────

  planta_industrial: {
    extreme_heat: [
      '↑ consumo energético en procesos productivos',
      'Riesgo de sobrecalentamiento en maquinaria industrial',
      'Presión sobre sistemas de ventilación y enfriamiento',
      'Riesgo de seguridad para personal en planta',
    ],
    severe_heat: [
      'Posible paralización de línea de producción por normativa',
      'Riesgo crítico de falla en equipos de proceso',
    ],
    drought: [
      'Presión hídrica severa en procesos industriales',
      'Riesgo de parada de producción por falta de agua',
      '↑ costos de tratamiento y recirculación de agua',
    ],
    extreme_rain: [
      'Inundación de planta y almacenes de materia prima',
      'Daño a maquinaria y equipos eléctricos',
      'Interrupción de recepción de insumos',
      'Riesgo de contaminación de productos',
    ],
    flood_risk: [
      'Daño catastrófico a maquinaria y existencias',
      'Interrupción prolongada de producción',
      'Pérdida de materia prima y producto terminado',
    ],
    landslide_risk: [
      'Riesgo estructural en planta ubicada en ladera',
    ],
    huayco_risk: [
      'Daño severo a infraestructura industrial',
      'Pérdida total de existencias y maquinaria',
      'Interrupción prolongada de operaciones',
    ],
    tropical_nights: [
      '↓ productividad del personal de turno nocturno',
      '↑ carga en sistemas de enfriamiento industrial nocturno',
    ],
  },
};

/**
 * Retorna impactos operacionales para una taxonomía y señal dadas.
 * @param {string} taxonomia - Clave de taxonomía (ej. "banco", "farmacia")
 * @param {string} signalType - Tipo de señal climática (ej. "extreme_heat", "flood_risk")
 * @returns {string[]|null} Array de impactos o null si no hay mapeo
 */
// Generic fallback impacts for signal types not yet mapped per-taxonomy
const FALLBACK_IMPACTS = {
  moderate_heat: [
    '↑ consumo energético moderado en climatización',
    'Posible reducción de productividad en horas de calor',
  ],
  extreme_rain_frequency: [
    '↑ frecuencia de interrupciones logísticas por lluvia intensa',
    'Riesgo de saturación de infraestructura de drenaje',
  ],
};

export function getTaxonomyImpacts(taxonomia, signalType) {
  const byTaxonomy = IMPACTS_BY_TAXONOMY[taxonomia];
  if (!byTaxonomy) return null;
  return byTaxonomy[signalType] ?? FALLBACK_IMPACTS[signalType] ?? null;
}

/**
 * Genera impactos adicionales según modificadores del perfil de negocio.
 * @param {object} profile - Perfil de unidad de negocio
 * @param {string} signalType - Tipo de señal climática
 * @returns {string[]} Impactos adicionales
 */
export function getModifierImpacts(profile, signalType) {
  const extras = [];

  if (!profile) return extras;

  // Modificador: cadena de frío
  if (profile.tiene_cadena_frio) {
    if (['extreme_heat', 'severe_heat', 'temp_increase', 'tropical_nights'].includes(signalType)) {
      extras.push('Cadena de frío activa — riesgo de pérdida de productos termosensibles');
    }
    if (['extreme_rain', 'flood_risk'].includes(signalType)) {
      extras.push('Cadena de frío activa — riesgo de falla eléctrica en equipos de refrigeración');
    }
  }

  // Modificador: data center
  if (profile.tiene_data_center) {
    if (['extreme_heat', 'severe_heat', 'temp_increase'].includes(signalType)) {
      extras.push('Data center propio — riesgo de sobrecalentamiento en sala de servidores');
    }
    if (['extreme_rain', 'flood_risk'].includes(signalType)) {
      extras.push('Data center propio — riesgo crítico de inundación en sala de servidores');
    }
    if (['drought'].includes(signalType)) {
      extras.push('Data center propio — riesgo por restricción hídrica en sistemas de enfriamiento');
    }
  }

  // Modificador: estacionamientos subterráneos
  if (profile.estacionamientos_subterraneos) {
    if (['extreme_rain', 'flood_risk'].includes(signalType)) {
      extras.push('Estacionamiento subterráneo — riesgo de inundación y daño a vehículos y equipos');
    }
  }

  // Modificador: depende de eventos presenciales
  if (profile.depende_eventos_presenciales) {
    if (['extreme_rain', 'flood_risk', 'extreme_heat', 'severe_heat', 'landslide_risk', 'huayco_risk'].includes(signalType)) {
      extras.push('Dependencia de afluencia presencial — riesgo de ↓ ingresos por cancelación de visitas');
    }
  }

  // Modificador: depende de turismo
  if (profile.depende_turismo) {
    if (['extreme_rain', 'flood_risk', 'extreme_heat', 'landslide_risk', 'huayco_risk'].includes(signalType)) {
      extras.push('Dependencia turística — riesgo de ↓ reservas y cancelaciones por condiciones climáticas adversas');
    }
  }

  return extras;
}

/**
 * Escala el rango financiero según el número de locales.
 * @param {{ min_usd: number, max_usd: number }} baseRange
 * @param {number} localesCount
 * @returns {{ min_usd: number, max_usd: number }}
 */
export function scaleFinancialRange(baseRange, localesCount) {
  if (!baseRange || !localesCount || localesCount <= 0) return baseRange;
  const factor = Math.max(1, localesCount / 100);
  return {
    min_usd: Math.round(baseRange.min_usd * factor),
    max_usd: Math.round(baseRange.max_usd * factor),
  };
}

export default IMPACTS_BY_TAXONOMY;
