// DIAGNÓSTICO: Visibilidad del Botón en Sidebar
// Este script ayuda a identificar por qué el botón no es visible sin scroll previo

console.log('🔍 INICIANDO DIAGNÓSTICO DE VISIBILIDAD DEL BOTÓN');

// Función para verificar el estado del sidebar
function diagnosticarSidebar() {
    console.log('\n=== DIAGNÓSTICO DEL SIDEBAR ===');
    
    // 1. Verificar si el sidebar está presente
    const sidebar = document.querySelector('[class*="fixed inset-0 z-"]');
    console.log('1. Sidebar encontrado:', !!sidebar);
    
    if (!sidebar) {
        console.log('❌ No se encontró el sidebar');
        return;
    }
    
    // 2. Verificar el contenedor del botón
    const buttonContainer = sidebar.querySelector('[class*="flex-shrink-0"]');
    console.log('2. Contenedor del botón encontrado:', !!buttonContainer);
    
    if (buttonContainer) {
        const rect = buttonContainer.getBoundingClientRect();
        console.log('   - Posición:', { top: rect.top, bottom: rect.bottom, height: rect.height });
        console.log('   - Visible en viewport:', rect.top < window.innerHeight && rect.bottom > 0);
        console.log('   - Estilos computados:', window.getComputedStyle(buttonContainer));
    }
    
    // 3. Verificar el botón de prueba
    const testButton = sidebar.querySelector('[class*="bg-green-500"]');
    console.log('3. Botón de prueba encontrado:', !!testButton);
    
    if (testButton) {
        const rect = testButton.getBoundingClientRect();
        console.log('   - Posición:', { top: rect.top, bottom: rect.bottom, height: rect.height });
        console.log('   - Visible en viewport:', rect.top < window.innerHeight && rect.bottom > 0);
        console.log('   - Texto:', testButton.textContent);
    }
    
    // 4. Verificar el botón real
    const realButton = sidebar.querySelector('button[aria-label="Agregar al carrito"]');
    console.log('4. Botón real encontrado:', !!realButton);
    
    if (realButton) {
        const rect = realButton.getBoundingClientRect();
        console.log('   - Posición:', { top: rect.top, bottom: rect.bottom, height: rect.height });
        console.log('   - Visible en viewport:', rect.top < window.innerHeight && rect.bottom > 0);
        console.log('   - Estilos:', window.getComputedStyle(realButton));
        console.log('   - Texto:', realButton.textContent);
    }
    
    // 5. Verificar información de debug
    const debugInfo = sidebar.querySelector('[class*="bg-yellow-100"]');
    console.log('5. Info de debug encontrada:', !!debugInfo);
    
    if (debugInfo) {
        console.log('   - Contenido:', debugInfo.textContent);
    }
    
    // 6. Verificar el estado del viewport
    console.log('6. Estado del viewport:');
    console.log('   - Altura:', window.innerHeight);
    console.log('   - Scroll Y:', window.scrollY);
    console.log('   - Body height:', document.body.scrollHeight);
    
    // 7. Verificar estilos del body
    console.log('7. Estilos del body:');
    const bodyStyles = window.getComputedStyle(document.body);
    console.log('   - Position:', bodyStyles.position);
    console.log('   - Top:', bodyStyles.top);
    console.log('   - Height:', bodyStyles.height);
    console.log('   - Overflow:', bodyStyles.overflow);
}

// Función para probar en diferentes escenarios
function probarEscenarios() {
    console.log('\n=== PRUEBA DE ESCENARIOS ===');
    
    // Escenario 1: Sin scroll (Y=0)
    console.log('\n--- Escenario 1: Sin scroll (Y=0) ---');
    window.scrollTo(0, 0);
    setTimeout(() => {
        console.log('Posición actual:', window.scrollY);
        diagnosticarSidebar();
    }, 100);
    
    // Escenario 2: Con scroll (Y=500)
    setTimeout(() => {
        console.log('\n--- Escenario 2: Con scroll (Y=500) ---');
        window.scrollTo(0, 500);
        setTimeout(() => {
            console.log('Posición actual:', window.scrollY);
            diagnosticarSidebar();
        }, 100);
    }, 2000);
}

// Función para monitorear cambios
function monitorearCambios() {
    console.log('\n=== MONITOREANDO CAMBIOS ===');
    
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList') {
                const addedNodes = Array.from(mutation.addedNodes);
                const sidebarAdded = addedNodes.some(node => 
                    node.nodeType === 1 && 
                    node.classList && 
                    node.classList.toString().includes('fixed')
                );
                
                if (sidebarAdded) {
                    console.log('🔍 Sidebar agregado al DOM');
                    setTimeout(diagnosticarSidebar, 100);
                }
            }
        });
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    
    console.log('✅ Monitor de cambios activado');
}

// Función principal
function iniciarDiagnostico() {
    console.log('🚀 Diagnóstico iniciado');
    console.log('📋 Instrucciones:');
    console.log('1. Ejecuta este script');
    console.log('2. Haz clic en un producto para abrir el sidebar');
    console.log('3. Revisa la consola para ver el diagnóstico');
    console.log('4. Prueba con y sin scroll previo');
    
    monitorearCambios();
    
    // Si ya hay un sidebar abierto, diagnosticarlo
    if (document.querySelector('[class*="fixed inset-0 z-"]')) {
        console.log('🔍 Sidebar ya presente, diagnosticando...');
        diagnosticarSidebar();
    }
}

// Funciones de utilidad para testing manual
window.diagnosticarSidebar = diagnosticarSidebar;
window.probarEscenarios = probarEscenarios;
window.scrollYCero = () => {
    window.scrollTo(0, 0);
    console.log('📍 Scroll movido a Y=0');
};
window.scrollY500 = () => {
    window.scrollTo(0, 500);
    console.log('📍 Scroll movido a Y=500');
};

// Iniciar automáticamente
iniciarDiagnostico();

console.log('\n🔧 FUNCIONES DISPONIBLES:');
console.log('- diagnosticarSidebar() - Diagnostica el estado actual');
console.log('- probarEscenarios() - Prueba diferentes posiciones de scroll');
console.log('- scrollYCero() - Mueve scroll a Y=0');
console.log('- scrollY500() - Mueve scroll a Y=500');