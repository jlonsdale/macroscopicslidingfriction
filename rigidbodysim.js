class RigidBodySimScene {
    constructor(cube, plane) {
        this.cube = cube;
        this.plane = plane;
        this.dt = 0.016; // Time step
    }

    step() {
        //push to left to make sure its working
        const cubepos = this.cube.getMesh().position;
        this.cube.updatePosition(cubepos.x + 0.01, cubepos.y, cubepos.z);
    }


}
