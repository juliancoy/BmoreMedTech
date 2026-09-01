import os
from pathlib import Path

import docker
from docker.errors import NotFound


here = Path(os.path.abspath(os.path.dirname(__file__)))

colima_socket_path = f"unix://{os.path.expanduser('~')}/.colima/default/docker.sock"
if os.path.exists(colima_socket_path):
    print("Colima socket detected. Attaching to that")
    os.environ["DOCKER_HOST"] = colima_socket_path

DOCKER_CLIENT = docker.from_env()


def list_containers(show_all: bool = False) -> str:
    try:
        containers = DOCKER_CLIENT.containers.list(all=show_all)
        if not containers:
            return "No containers found"

        result = "CONTAINER ID\tIMAGE\tSTATUS\tNAMES\n"
        for container in containers:
            image = container.image.tags[0] if container.image.tags else "none"
            result += f"{container.short_id}\t{image}\t{container.status}\t{container.name}\n"
        return result
    except Exception as error:
        return f"Error listing containers: {error}"


def remove_container(container_name: str) -> None:
    try:
        container = DOCKER_CLIENT.containers.get(container_name)
        container.stop()
        container.remove(force=True)
    except NotFound:
        return
    except Exception:
        return


def run_container(config: dict):
    print(f'\033[4;32mRunning container {config["name"]}\033[0m')
    container_name = config["name"]
    try:
        container = DOCKER_CLIENT.containers.get(container_name)
        print(f"Container {container_name} is in status '{container.status}'")
        if container.status == "running":
            print(f"Container {container_name} is already running")
            return container
        if container.status == "restarting":
            print("Stopping container")
            container.stop()
        print("Removing")
        container.remove()
    except NotFound:
        print(f"No container is running with name {container_name}")
    except Exception as error:
        print(f"Could not inspect existing container {container_name}: {error}")

    print(f"Starting {container_name}")
    return DOCKER_CLIENT.containers.run(**config)
