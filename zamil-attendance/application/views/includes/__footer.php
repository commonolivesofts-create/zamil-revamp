</div>
</main>

<!-- Bootstrap JS -->
<script type="text/javascript" src="https://cdn.jsdelivr.net/npm/toastify-js"></script>
<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
<!-- <script src="vendors/fontawesome/all.min.js"></script> -->

<script src="<?= base_url() ?>assets/js/pages/pagination.js"></script>
<script src="<?= base_url() ?>assets/js/pages/common.js"></script>

<script>
    document.addEventListener('DOMContentLoaded', function () {
        setTimeout(function () {
            const activeLink = <?= json_encode((string) ($this->load->get_var('active-link') ?? '')) ?>;
            const currentPath = window.location.pathname.replace(/\/+$/, '') || '/';
            const navLinks = document.querySelectorAll('.sidebar .nav-link');

            navLinks.forEach(function (link) {
                const linkActiveKey = link.getAttribute('data-active-link');
                if (activeLink && linkActiveKey) {
                    link.classList.toggle('active', linkActiveKey === activeLink || (activeLink === 'dashboard' && linkActiveKey === 'home'));
                    return;
                }

                const href = link.getAttribute('href');
                if (!href || href === '#') {
                    return;
                }

                const linkPath = new URL(href, window.location.origin).pathname.replace(/\/+$/, '') || '/';
                link.classList.toggle('active', linkPath === currentPath);
            });
        }, 0);
    });
</script>





<script>
    window.developer = window.developer || {};
    window.loggedInUser = window.loggedInUser || '';
    window.developer.config = window.developer.config || {};
    window.developer.config.urls = {
        baseURL: <?= json_encode(base_url()) ?>,
    };

    // Assign LoggedInUser

    const {
        baseURL
    } = window.developer.config.urls;
</script>

<?= render_scripts($scripts ?? []) ?>

</body>

</html>