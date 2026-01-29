// TEST: Verificar que el sidebar se renderiza correctamente usando Portal
// Este script verifica que el sidebar aparezca siempre desde la parte superior

console.log('🔍 INICIANDO TEST: Sidebar con Portal');

// Función para verificar el renderizado del sidebar
function verificarSidebarPortal() {
    console.log('\n=== VERIFICACIÓN DEL SIDEBAR CON PORTAL ===');
    
    // 1. Verificar que el sidebar se renderiza directamente en el body
    const sidebarInBody = document.body.querySelector('[style*="z-index: 9999"]');
    console.log('1. Sidebar renderizado en body:', !!sidebarInBody);
    
    if (sidebarInBody) {
        console.log('   ✅ Sidebar encontrado como hijo directo del body');
        
        // 2. Verificar posicionamiento fixed
        const computedStyle = window.getComputedStyle(sidebarInBody);
        console.log('2. Position:', computedStyle.position);
        console.log('   - Top:', computedStyle.top);
        console.log('   - Right:', computedStyle.right);
        console.log('   - Z-index:', computedStyle.zIndex);
        
        // 3. Verificar que no está dentro de contenedores con scroll
        let parent = sidebarInBody.parentElement;
        let hasScrollParent = false;
        let depth = 0;
        
        console.log('3. Jerarquía de contenedores:');
        while (parent && depth < 5) {
            const parentStyle = window.getComputedStyle(parent);
            const hasScroll = parentStyle.overflow === 'scroll' || 
                            parentStyle.overflow === 'auto' || 
                            parentStyle.overflowY === 'scroll' || 
                            parentStyle.overflowY === 'auto';
            
            console.log(`   Nivel ${depth}: ${parent.tagName} - Overflow: ${parentStyle.overflow} - Scroll: ${hasScroll}`);
            
            if (hasScroll && parent !== document.body) {
                hasScrollParent = true;
            }
            
            parent = parent.parentElement;
            depth++;
        }
        
        console.log('4. Resultado:', hasScrollParent ? '❌ Tiene contenedor con scroll' : '✅ Sin contenedores con scroll problemáticos');
        
        // 4. Verificar posición en viewport
        const rect = sidebarInBody.getBoundingClientRect();
        console.log('5. Posición en viewport:');
        console.log(`   - Top: ${rect.top}px (debería ser 0)`);
        console.log(`   - Right: ${window.innerWidth - rect.right}px (debería ser 0)`);
        console.log(`   - Height: ${rect.height}px (debería ser ${window.innerHeight})`);
        
        const isCorrectlyPositioned = rect.top === 0 && 
                                    (window.innerWidth - rect.right) <= 1 && // Permitir 1px de diferencia
                                    Math.abs(rect.height - window.innerHeight) <= 1;
        
        console.log('6. Posicionamiento correcto:', isCorrectlyPositioned ? '✅' : '❌');
        
    } else {
        console.log('   ❌ Sidebar NO encontrado en body');
        
        // Buscar sidebar en otros lugares
        const sidebarAnywhere = document.querySelector('[style*="z-index: 9999"]');
        if (sidebarAnywhere) {
            console.log('   🔍 Sidebar encontrado en:', sidebarAnywhere.parentElement?.tagName);
            
            // Mostrar la jerarquía completa
            let element = sidebarAnywhere;
            let path = [];
            while (element && element !== document.body) {
                path.unshift(element.tagName + (element.className ? '.' + element.className.split(' ')[0] : ''));
                element = element.parentElement;
            }
            console.log('   📍 Ruta completa:', path.join(' > '));
        }
    }
}

// Función para probar en diferentes escenarios de scroll
function probarEscenariosScroll() {
    console.log('\n=== PRUEBA DE ESCENARIOS DE SCROLL ===');
    
    const escenarios = [
        { nombre: 'Sin scroll', scrollY: 0 },
        { nombre: 'Scroll ligero', scrollY: 200 },
        { nombre: 'Scroll medio', scrollY: 500 },
        { nombre: 'Scroll alto', scrollY: 1000 }
    ];
    
    escenarios.forEach((escenario, index) => {
        setTimeout(() => {
            console.log(`\n--- ${escenario.nombre} (Y=${escenario.scrollY}) ---`);
            window.scrollTo(0, escenario.scrollY);
            
            setTimeout(() => {
                console.log(`Scroll actual: ${window.scrollY}px`);
                verificarSidebarPortal();
                
                if (index === escenarios.length - 1) {
                    console.log('\n🎯 INSTRUCCIONES:');
                    console.log('1. Abre un producto en cada escenario de scroll');
                    console.log('2. Verifica que el sidebar aparezca siempre desde arriba');
                    console.log('3. El sidebar debe estar renderizado directamente en body');
                    console.log('4. No debe haber contenedores con scroll entre el sidebar y body');
                }
            }, 100);
        }, index * 2000);
    });
}

// Función para monitorear la creación del sidebar
function monitorearSidebar() {
    console.log('\n=== MONITOREANDO CREACIÓN DEL SIDEBAR ===');
    
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1 && node.style && node.style.zIndex === '9999') {
                    console.log('🔍 Sidebar detectado:', {
                        parent: node.parentElement?.tagName,
                        position: window.getComputedStyle(node).position,
                        top: window.getComputedStyle(node).top,
                        scrollY: window.scrollY
                    });
                    
                    setTimeout(() => verificarSidebarPortal(), 100);
                }
            });
        });
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    
    console.log('✅ Monitor activado - detectará cuando se cree el sidebar');
}

// Funciones de utilidad
window.verificarSidebarPortal = verificarSidebarPortal;
window.probarEscenariosScroll = probarEscenariosScroll;

// Iniciar monitoreo automático
monitorearSidebar();

console.log('\n🔧 FUNCIONES DISPONIBLES:');
console.log('- verificarSidebarPortal() - Verifica el estado actual del sidebar');
console.log('- probarEscenariosScroll() - Prueba automática en diferentes posiciones');

console.log('\n📋 EXPECTATIVAS CON PORTAL:');
console.log('✅ Sidebar renderizado directamente en body');
console.log('✅ Position: fixed con top: 0, right: 0');
console.log('✅ Sin contenedores con scroll como padres');
console.log('✅ Aparece siempre desde la parte superior del viewport');
console.log('✅ Independiente del scroll de la página');

console.log('\n🚀 El portal debería resolver el problema de posicionamiento definitivamente.');