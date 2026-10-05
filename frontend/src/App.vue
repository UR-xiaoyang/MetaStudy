<script setup>
import { ref, computed } from 'vue';
import LoginView from './views/LoginView.vue';
import ClassesView from './views/ClassesView.vue';
import ClassCoursesView from './views/ClassCoursesView.vue';
import CourseDetailView from './views/CourseDetailView.vue';
import ProfileView from './views/ProfileView.vue';
import { loadSession, clearSession } from './api/client.js';

const user = ref(loadSession()?.user ?? null);
const isLoggedIn = computed(() => !!user.value);

const view = ref('classes'); // classes | profile
const currentClass = ref(null);
const currentCourse = ref(null);

function onLogin(session) {
  user.value = session.user;
}

function onLogout() {
  clearSession();
  user.value = null;
  view.value = 'classes';
  currentClass.value = null;
  currentCourse.value = null;
}

// 从主界面点击用户名进入个人中心
function openProfile() {
  view.value = 'profile';
  currentClass.value = null;
  currentCourse.value = null;
}

// 从个人中心返回主界面
function backToClasses() {
  view.value = 'classes';
  currentClass.value = null;
  currentCourse.value = null;
}

function openClass(cls) {
  currentClass.value = cls;
  currentCourse.value = null;
  view.value = 'courses';
}

function openCourse(course) {
  currentCourse.value = course;
}

function backFromClass() {
  currentClass.value = null;
  view.value = 'classes';
}

function backFromCourse() {
  currentCourse.value = null;
  view.value = 'courses';
}
</script>

<template>
  <LoginView v-if="!isLoggedIn" @login="onLogin" />
  <ClassesView
    v-else-if="view === 'classes'"
    :user="user"
    @logout="onLogout"
    @open-class="openClass"
    @open-profile="openProfile"
  />
  <ProfileView
    v-else-if="view === 'profile'"
    :user="user"
    @back="backToClasses"
    @open-class="openClass"
  />
  <ClassCoursesView
    v-else-if="currentClass && !currentCourse"
    :user="user"
    :class-info="currentClass"
    @back="backFromClass"
    @open-course="openCourse"
  />
  <CourseDetailView
    v-else
    :user="user"
    :course="currentCourse"
    @back="backFromCourse"
  />
</template>
