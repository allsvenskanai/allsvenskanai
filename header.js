const menuToggle = document.querySelector(".menu-toggle");
const mainNav = document.querySelector(".main-nav");
const navLinks = document.querySelectorAll(".nav-link");

function setActiveNavLink() {
  const currentHash = window.location.hash || "#tabell";
  const currentPath = window.location.pathname;

  navLinks.forEach((link) => {
    const url = new URL(link.href, window.location.origin);
    const isSameHash = url.hash && url.hash === currentHash;
    const isHomeSection = currentPath === "/" || currentPath.endsWith("index.html");

    link.classList.toggle("active", isHomeSection && isSameHash);
  });
}

if (menuToggle && mainNav) {
  menuToggle.addEventListener("click", () => {
    const isOpen = mainNav.classList.toggle("open");
    menuToggle.setAttribute("aria-expanded", String(isOpen));
  });

  navLinks.forEach((link) => {
    link.addEventListener("click", () => {
      mainNav.classList.remove("open");
      menuToggle.setAttribute("aria-expanded", "false");
    });
  });
}

window.addEventListener("hashchange", setActiveNavLink);
setActiveNavLink();
