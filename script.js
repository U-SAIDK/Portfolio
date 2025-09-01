// Enhanced Portfolio JavaScript with Premium Features

// Ensure DOM is loaded before running scripts
document.addEventListener('DOMContentLoaded', function() {
    // Initialize all features
    initLoader();
    initNavigation();
    initParticleSystem();
    initScrollAnimations();
    initThemeToggle();
    initSkills();       // Make sure these are called
    initProjects();     // Make sure these are called
    initContactForm();
    initSmoothScrolling();
    
    // Add scroll animations for skill and project cards
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animated');
            }
        });
    }, { threshold: 0.1 });

    // Observe skill and project cards
    document.querySelectorAll('.skill-card, .project-card').forEach(card => {
        observer.observe(card);
    });
});

// Loading Screen
function initLoader() {
    const loader = document.getElementById('loader');
    
    // Simulate loading time for dramatic effect
    setTimeout(() => {
        loader.style.opacity = '0';
        setTimeout(() => {
            loader.style.display = 'none';
            // Trigger hero animation
            document.querySelector('[data-animate="fade-in"]').style.opacity = '1';
            document.querySelector('[data-animate="fade-in"]').style.transform = 'translateY(0)';
        }, 500);
    }, 1500);
}

// Navigation Enhancement
function initNavigation() {
    const navbar = document.getElementById('navbar');
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    const navLinks = document.querySelectorAll('.nav-link');

    // Navbar scroll effect
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // Mobile menu toggle
    mobileMenuBtn.addEventListener('click', () => {
        mobileMenu.classList.toggle('hidden');
        const icon = mobileMenuBtn.querySelector('i');
        icon.classList.toggle('fa-bars');
        icon.classList.toggle('fa-times');
    });

    // Active link highlighting
    window.addEventListener('scroll', () => {
        let current = '';
        const sections = document.querySelectorAll('section[id]');
        
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.clientHeight;
            if (scrollY >= (sectionTop - 200)) {
                current = section.getAttribute('id');
            }
        });

        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${current}`) {
                link.classList.add('active');
            }
        });
    });

    // Close mobile menu when link is clicked
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            mobileMenu.classList.add('hidden');
            const icon = mobileMenuBtn.querySelector('i');
            icon.classList.add('fa-bars');
            icon.classList.remove('fa-times');
        });
    });
}

// Particle System for Hero Section
function initParticleSystem() {
    const canvas = document.getElementById('particles-canvas');
    const ctx = canvas.getContext('2d');
    let particles = [];
    let animationId;

    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    function createParticle() {
        return {
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            size: Math.random() * 3 + 1,
            speedX: Math.random() * 3 - 1.5,
            speedY: Math.random() * 3 - 1.5,
            opacity: Math.random() * 0.5 + 0.2,
            color: `hsl(${Math.random() * 60 + 220}, 70%, 60%)`
        };
    }

    function initParticles() {
        particles = [];
        const particleCount = Math.min(100, Math.floor(canvas.width * canvas.height / 15000));
        for (let i = 0; i < particleCount; i++) {
            particles.push(createParticle());
        }
    }

    function updateParticles() {
        particles.forEach(particle => {
            particle.x += particle.speedX;
            particle.y += particle.speedY;

            // Wrap around edges
            if (particle.x > canvas.width) particle.x = 0;
            if (particle.x < 0) particle.x = canvas.width;
            if (particle.y > canvas.height) particle.y = 0;
            if (particle.y < 0) particle.y = canvas.height;

            // Subtle opacity animation
            particle.opacity += Math.sin(Date.now() * 0.001 + particle.x * 0.01) * 0.01;
            particle.opacity = Math.max(0.1, Math.min(0.7, particle.opacity));
        });
    }

    function drawParticles() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        particles.forEach(particle => {
            ctx.save();
            ctx.globalAlpha = particle.opacity;
            ctx.fillStyle = particle.color;
            ctx.beginPath();
            ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });

        // Draw connections
        particles.forEach((particle, i) => {
            particles.slice(i + 1).forEach(otherParticle => {
                const dx = particle.x - otherParticle.x;
                const dy = particle.y - otherParticle.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < 100) {
                    ctx.save();
                    ctx.globalAlpha = (100 - distance) / 100 * 0.2;
                    ctx.strokeStyle = '#6366f1';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(particle.x, particle.y);
                    ctx.lineTo(otherParticle.x, otherParticle.y);
                    ctx.stroke();
                    ctx.restore();
                }
            });
        });
    }

    function animate() {
        updateParticles();
        drawParticles();
        animationId = requestAnimationFrame(animate);
    }

    // Initialize
    resizeCanvas();
    initParticles();
    animate();

    // Handle resize
    window.addEventListener('resize', () => {
        resizeCanvas();
        initParticles();
    });

    // Pause animation when not visible
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            cancelAnimationFrame(animationId);
        } else {
            animate();
        }
    });
}

// Scroll Animations
function initScrollAnimations() {
    const animatedElements = document.querySelectorAll('[data-animate]');
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const element = entry.target;
                const animationType = element.getAttribute('data-animate');
                const delay = element.getAttribute('data-delay') || 0;
                
                setTimeout(() => {
                    element.style.opacity = '1';
                    element.style.transform = 'translateY(0)';
                    element.classList.add('animated');
                }, delay);
                
                observer.unobserve(element);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

    animatedElements.forEach(element => {
        observer.observe(element);
    });
}

// Theme Toggle
function initThemeToggle() {
    const themeToggle = document.getElementById('theme-toggle');
    const html = document.documentElement;
    const icon = themeToggle.querySelector('i');

    // Check for saved theme preference
    const savedTheme = localStorage.getItem('theme') || 'dark';
    html.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);

    themeToggle.addEventListener('click', () => {
        const currentTheme = html.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        html.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeIcon(newTheme);
        
        // Add ripple effect
        createRipple(themeToggle);
    });

    function updateThemeIcon(theme) {
        icon.className = theme === 'dark' ? 'fas fa-sun text-yellow-400' : 'fas fa-moon text-blue-400';
    }
}

// Skills Section
function initSkills() {
    const skillsData = [
        // Programming Languages
        { name: 'HTML5', icon: 'fab fa-html5', level: 95 },
        { name: 'CSS3', icon: 'fab fa-css3-alt', level: 90 },
        { name: 'JavaScript', icon: 'fab fa-js', level: 88 },
        { name: 'Python', icon: 'fab fa-python', level: 85 },
        { name: 'Wordpress Expertise', icon: 'fab fa-wordpress', level: 85 },

        // Tools & Technologies
        { name: 'GitHub', icon: 'fab fa-github', level: 92 },
        { name: 'REST APIs', icon: 'fas fa-code', level: 88 },
        { name: 'Docker', icon: 'fab fa-docker', level: 85 },
        { name: 'Figma', icon: 'fab fa-figma', level: 90 },
        
        // AI & Automation
        { name: 'LangChain', icon: 'fas fa-robot', level: 88 },
        { name: 'Ai Tools ', icon: 'fas fa-cogs', level: 92 },
        { name: 'LLM/AI', icon: 'fas fa-brain', level: 85 },
        { name: 'RAG', icon: 'fas fa-database', level: 82 },
        
        // Soft Skills
        { name: 'Communication', icon: 'fas fa-comments', level: 95 },
        { name: 'Problem Solving', icon: 'fas fa-puzzle-piece', level: 94 },
        { name: 'Adaptability', icon: 'fas fa-sync-alt', level: 92 },
        { name: 'Strategic Thinking', icon: 'fas fa-chess', level: 90 }
    ];

    const skillsContainer = document.querySelector('#skills .grid');
    
    skillsData.forEach((skill, index) => {
        const skillCard = document.createElement('div');
        skillCard.className = 'skill-card opacity-0';
        skillCard.setAttribute('data-animate', 'slide-up');
        skillCard.setAttribute('data-delay', (index * 100).toString());
        
        skillCard.innerHTML = `
            <div class="skill-icon">
                <i class="${skill.icon}"></i>
            </div>
            <h3 class="text-xl font-semibold text-white mb-2">${skill.name}</h3>
            <div class="w-full bg-gray-700 rounded-full h-2 mb-2">
                <div class="bg-gradient-to-r from-primary to-accent h-2 rounded-full transition-all duration-1000" 
                     style="width: 0%" data-width="${skill.level}%"></div>
            </div>
            <span class="text-gray-400">${skill.level}%</span>
        `;
        
        skillsContainer.appendChild(skillCard);
    });

    // Animate progress bars when in view
    const skillBars = document.querySelectorAll('#skills .bg-gradient-to-r');
    const skillObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const bar = entry.target;
                const width = bar.getAttribute('data-width');
                setTimeout(() => {
                    bar.style.width = width;
                }, 500);
                skillObserver.unobserve(bar);
            }
        });
    });

    skillBars.forEach(bar => skillObserver.observe(bar));
}

// Projects Section
function initProjects() {
    const projectsData = [
        {
            title: 'Google Maps Scraper (API-less)',
            description: 'Created a fully functional Google Maps scraper without using any APIs, utilizing complex custom logic to extract and customize business data.',
            technologies: ['Python', 'Custom Logic', 'Data Extraction' , 'Lead Generation'],
            image: 'fas fa-map-marked-alt',
            link: '#',
            github: '#'
        },
        {
            title: 'LinkedIn Profile Scraper',
            description: 'Developed a cookieless LinkedIn scraper using Ghost API, with integration to Slack and Google Sheets for data logging.',
            technologies: ['Ghost API', 'Slack', 'Google Sheets', 'Automation'],
            image: 'fab fa-linkedin',
            link: '#',
            github: '#'
        },
        {
            title: ' Form Automation & Notification',
            description: 'Automated Form Handling Automation with Email & Slack',
            technologies: ['Python', 'Custom Logic', 'Data Extraction'],
            image: 'fas fa-map-marked-alt',
            link: '#',
            github: '#'
        },
        {
            title: 'Chat with Documents/Custom Slack Bot',
            description: 'Smart document chat system using audio transcription and Qdrant Vector Store for AI-based Q&A capabilities.',
            technologies: ['Qdrant', 'AI', 'Transcription', 'Vector Store' , 'Embedding'],
            image: 'fas fa-comments',
            link: '#',
            github: '#'
        },
        {
            title: 'CRM Handler',
            description: 'Smart document chat system using audio transcription and Qdrant Vector Store for AI-based Q&A capabilities.',
            technologies: ['Qdrant', 'AI', 'Transcription', 'Vector Store'],
            image: 'fas fa-comments',
            link: '#',
            github: '#'
        },
        {
            title: 'Traffic Management Website',
            description: 'Responsive traffic management website built as Frontend Engineer with backend team collaboration.',
            technologies: ['HTML', 'CSS', 'JavaScript' , 'PHP'],
            image: 'fas fa-traffic-light',
            link: '#',
            github: '#'
        },
        {
            title: 'Dynamic Portfolio Website',
            description: 'Responsive and Modern portfolio website with stunning UI/UX and features.',
            technologies: ['HTML', 'CSS', 'JavaScript' , 'Typescript' , 'TailwindCSS' , 'React' ],
            image: 'fas fa-traffic-light',
            link: '#',
            github: '#'
        },
        {
            title: 'AI Chat Model',
            description: 'Ai Chat Model which can be intgrated into any website.',
            technologies: ['OpenAI', 'Chatbot', 'AI'],
            image: 'fas fa-robot',
            link: '#',
            github: '#'
        },
        {
            title: 'Telegram Chatbot',
            description: 'Fully functional Telegram Chatbot for automated user interactions and service handling.',
            technologies: ['Full Customization', 'Query Solving', 'Automation'],
            image: 'fab fa-telegram',
            link: '#',
            github: '#'
        }
    ];

    const projectsGrid = document.getElementById('projects-grid');
    
    projectsData.forEach((project, index) => {
        const projectCard = document.createElement('div');
        projectCard.className = 'project-card opacity-0';
        projectCard.setAttribute('data-animate', 'slide-up');
        projectCard.setAttribute('data-delay', (index * 150).toString());
        
        projectCard.innerHTML = `
            <div class="project-image">
                <i class="${project.image} text-6xl text-primary"></i>
            </div>
            <div class="p-6 relative z-10">
                <h3 class="text-xl font-bold text-white mb-3">${project.title}</h3>
                <p class="text-gray-300 mb-4 leading-relaxed">${project.description}</p>
                <div class="flex flex-wrap gap-2 mb-4">
                    ${project.technologies.map(tech => 
                        `<span class="px-3 py-1 bg-primary/20 text-primary rounded-full text-sm">${tech}</span>`
                    ).join('')}
                </div>
                <div class="flex space-x-4">
                    <a href="${project.link}" class="text-accent hover:text-white transition-colors">
                        <i class="fas fa-external-link-alt mr-2"></i>Demo
                    </a>
                    <a href="${project.github}" class="text-gray-400 hover:text-white transition-colors">
                        <i class="fab fa-github mr-2"></i>Code
                    </a>
                </div>
            </div>
        `;
        
        projectsGrid.appendChild(projectCard);
    });
}

// Contact Form
function initContactForm() {
    const form = document.getElementById('contact-form');
    const inputs = form.querySelectorAll('input, textarea');

    // Add floating label animation
    inputs.forEach(input => {
        input.addEventListener('focus', () => {
            input.parentElement.classList.add('focused');
        });

        input.addEventListener('blur', () => {
            if (!input.value) {
                input.parentElement.classList.remove('focused');
            }
        });

        // Check if input has value on load
        if (input.value) {
            input.parentElement.classList.add('focused');
        }
    });

    // Form submission
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        
        // Simulate form submission
        submitBtn.innerHTML = '<i class="fas fa-spinner animate-spin mr-2"></i>Sending...';
        submitBtn.disabled = true;
        
        setTimeout(() => {
            submitBtn.innerHTML = '<i class="fas fa-check mr-2"></i>Message Sent!';
            submitBtn.classList.remove('from-primary', 'to-secondary');
            submitBtn.classList.add('from-green-500', 'to-green-600');
            
            setTimeout(() => {
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
                submitBtn.classList.remove('from-green-500', 'to-green-600');
                submitBtn.classList.add('from-primary', 'to-secondary');
                form.reset();
            }, 2000);
        }, 2000);
    });
}

// Smooth Scrolling
function initSmoothScrolling() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Hero button actions
    document.querySelector('.hero-btn').addEventListener('click', () => {
        document.getElementById('projects').scrollIntoView({
            behavior: 'smooth'
        });
    });
}

// Typewriter Effect
function initTypewriter() {
    const texts = [
        'Creative Developer',
        'UI/UX Designer',
        'Problem Solver',
        'Digital Artist'
    ];
    
    let textIndex = 0;
    let charIndex = 0;
    let isDeleting = false;
    const typeSpeed = 100;
    const deleteSpeed = 50;
    const pauseTime = 1500;

    function typeWriter() {
        const currentText = texts[textIndex];
        const element = document.querySelector('.typewriter');
        
        if (!element) return;

        if (isDeleting) {
            element.textContent = currentText.substring(0, charIndex - 1);
            charIndex--;
        } else {
            element.textContent = currentText.substring(0, charIndex + 1);
            charIndex++;
        }

        let speed = isDeleting ? deleteSpeed : typeSpeed;

        if (!isDeleting && charIndex === currentText.length) {
            speed = pauseTime;
            isDeleting = true;
        } else if (isDeleting && charIndex === 0) {
            isDeleting = false;
            textIndex = (textIndex + 1) % texts.length;
        }

        setTimeout(typeWriter, speed);
    }

    // Start typewriter effect
    setTimeout(typeWriter, 2000);
}

// Utility Functions
function createRipple(element) {
    const ripple = document.createElement('span');
    const rect = element.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = rect.width / 2;
    const y = rect.height / 2;
    
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = (x - size / 2) + 'px';
    ripple.style.top = (y - size / 2) + 'px';
    ripple.classList.add('ripple');
    
    element.appendChild(ripple);
    
    setTimeout(() => {
        ripple.remove();
    }, 600);
}

// Mouse parallax effect for hero section
document.addEventListener('mousemove', (e) => {
    const hero = document.getElementById('home');
    if (!hero) return;
    
    const { clientX, clientY } = e;
    const { innerWidth, innerHeight } = window;
    
    const xPos = (clientX / innerWidth) - 0.5;
    const yPos = (clientY / innerHeight) - 0.5;
    
    const particles = document.getElementById('particles-canvas');
    if (particles) {
        particles.style.transform = `translate(${xPos * 20}px, ${yPos * 20}px)`;
    }
});

// Performance optimization: Debounce scroll events
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Add CSS for ripple effect
const style = document.createElement('style');
style.textContent = `
    .ripple {
        position: absolute;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.4);
        transform: scale(0);
        animation: ripple-animation 0.6s linear;
        pointer-events: none;
    }
    
    @keyframes ripple-animation {
        to {
            transform: scale(4);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Update any missing event listeners
window.addEventListener('load', function() {
    // Remove loader after page is fully loaded
    const loader = document.getElementById('loader');
    if (loader) {
        loader.style.opacity = '0';
        setTimeout(() => {
            loader.style.display = 'none';
        }, 500);
    }
});
