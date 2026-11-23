<style>
    .avatar-sm {
        width: 2.5rem;
        height: 2rem;
    }

    .avatar-md {
        width: 2.5rem;
        height: 2.0rem;
    }
</style>
<!-- TOPBAR -->
<nav id="topbar" class="navbar bg-white border-bottom fixed-top topbar px-3">
    <button id="toggleBtn" class="d-none d-lg-inline-flex btn btn-light btn-icon btn-sm ">
        <i class="ti ti-layout-sidebar-left-expand"></i>
    </button>

    <!-- MOBILE -->
    <button id="mobileBtn" class="btn btn-light btn-icon btn-sm d-lg-none me-2">
        <i class="ti ti-layout-sidebar-left-expand"></i>
    </button>
    <div>
        <!-- Navbar nav -->
        <ul class="list-unstyled d-flex align-items-center mb-0 gap-1">
            <!-- Pages link -->

            <!-- Bell icon -->
            <li>
                <a class="position-relative btn-icon btn-sm btn-light btn rounded-circle" data-bs-toggle="dropdown"
                    aria-expanded="false" href="#" role="button">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
                        class="icon icon-tabler icons-tabler-outline icon-tabler-bell">
                        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                        <path d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6" />
                        <path d="M9 17v1a3 3 0 0 0 6 0v-1" />
                    </svg>
                    <span class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger mt-2 ms-n2">
                        2
                        <span class="visually-hidden">unread messages</span>
                    </span>
                </a>
                <div class="dropdown-menu dropdown-menu-end dropdown-menu-md p-0">
                    <ul class="list-unstyled p-0 m-0">
                        <li class="p-3 border-bottom ">
                            <div class="d-flex gap-3">
                                <img src="<?= base_url() ?>assets/images/user-icon.png" alt="" class="avatar avatar-sm rounded-circle" />
                                <div class="flex-grow-1 small">
                                    <p class="mb-0">New order received</p>
                                    <p class="mb-1">Order #12345 has been placed</p>
                                    <div class="text-secondary">5 minutes ago</div>
                                </div>
                            </div>
                        </li>
                        <li class="p-3 border-bottom ">
                            <div class="d-flex gap-3">
                                <img src="<?= base_url() ?>assets/images/avatar-4.jpg" alt="" class="avatar avatar-sm rounded-circle" />
                                <div class="flex-grow-1 small">
                                    <p class="mb-0">New user registered</p>
                                    <p class="mb-1">User @john_doe has signed up</p>
                                    <div class="text-secondary">30 minutes ago</div>
                                </div>
                        </li>

                        <li class="p-3 border-bottom">
                            <div class="d-flex gap-3">
                                <img src="<?= base_url() ?>assets/images/avatar-2.jpg" alt="" class="avatar avatar-sm rounded-circle" />
                                <div class="flex-grow-1 small">
                                    <p class="mb-0">Payment confirmed</p>
                                    <p class="mb-1">Payment of $299 has been received</p>
                                    <div class="text-secondary">1 hour ago</div>
                                </div>
                            </div>
                        </li>
                        <li class="px-4 py-3 text-center">
                            <a href="#" class="text-primary ">View all notifications</a>
                        </li>
                    </ul>
                </div>
            </li>
            <!-- Dropdown -->
            <li class="ms-3 dropdown">
                <a href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">
                    <img src="<?= base_url() ?>assets/images/user-icon.png" alt="" class="avatar avatar-sm rounded-circle" />
                </a>
                <div class="dropdown-menu dropdown-menu-end p-0" style="min-width: 200px;">
                    <div>
                        <div class="d-flex gap-3 align-items-center border-dashed border-bottom px-3 py-3">
                            <img src="<?= base_url() ?>assets/images/user-icon.png" alt="" class="avatar avatar-md rounded-circle" />
                            <div>
                                <h4 class="mb-0 small"><?= html_escape($loggedInUser['FULL_NAME'] ?? '') ?></h4>
                                <p class="mb-0  small"><?= html_escape($loggedInUser['EMPLOYEE_NUMBER'] ?? '') ?></p>
                            </div>
                        </div>
                        <div class="p-3 d-flex flex-column gap-1 small lh-lg">
                            <a href="<?= base_url() ?>">
                                <span>Dashboard</span>
                            </a>
                            <!-- Sign-out also ends the Zamil Digitalization session (single sign-on). -->
                            <form method="post" action="<?= base_url('logout') ?>" class="m-0">
                                <button type="submit" class="btn btn-link p-0 text-start text-decoration-none small">Sign out</button>
                            </form>
                        </div>

                    </div>
                </div>
            </li>
        </ul>
    </div>

</nav>