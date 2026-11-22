#include "PropCluster.h"
#include "Components/HierarchicalInstancedStaticMeshComponent.h"

APropCluster::APropCluster()
{
	PrimaryActorTick.bCanEverTick = false;
	Instances = CreateDefaultSubobject<UHierarchicalInstancedStaticMeshComponent>(TEXT("Instances"));
	SetRootComponent(Instances);
	Instances->SetMobility(EComponentMobility::Static);
	Instances->SetCastShadow(true);
	Instances->bAffectDistanceFieldLighting = true;
}

int32 APropCluster::Fill(UStaticMesh* Mesh, const TArray<FTransform>& WorldTransforms, bool bCollide)
{
	if (!Mesh) return 0;
	Instances->SetStaticMesh(Mesh);
	Instances->SetCollisionEnabled(bCollide ? ECollisionEnabled::QueryAndPhysics : ECollisionEnabled::NoCollision);
	if (bCollide) Instances->SetCollisionProfileName(TEXT("BlockAll"));
	Instances->ClearInstances();
	Instances->AddInstances(WorldTransforms, false, true, false);
	return Instances->GetInstanceCount();
}
